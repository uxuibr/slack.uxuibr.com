const express = require('express');
const router = express.Router();
const request = require('request');

const config = require('../config');
const { badge } = require('../lib/badge');

router.get('/', function(req, res) {
  res.setLocale(config.locale);
  res.render('index', { community: config.community,
                        tokenRequired: !!config.inviteToken,
                        recaptchaSiteKey: config.recaptchaSiteKey });
});

router.post('/invite', function(req, res) {
  if (req.body.email && (!config.inviteToken || (!!config.inviteToken && req.body.token === config.inviteToken))) {
    function doInvite() {
      request.post({
          url: 'https://'+ config.slackUrl + '/api/users.admin.invite',
          form: {
            email: req.body.email,
            token: config.slacktoken,
            set_active: true
          }
        }, function(err, httpResponse, body) {
          // body looks like:
          //   {"ok":true}
          //       or
          //   {"ok":false,"error":"already_invited"}
          if (err) { return res.send('Error:' + err); }
          body = JSON.parse(body);
          if (body.ok) {
            res.render('result', {
              community: config.community,
              message: 'Feito! Entre no email &ldquo;'+ req.body.email +'&rdquo; para pegar seu convite.'
            });
          } else {
            let error = body.error;
            if (error === 'already_invited' || error === 'already_in_team') {
              res.render('result', {
                community: config.community,
                message: 'Feito! Você já foi convidado.<br>' +
                        'Visite <a href="https://'+ config.slackUrl +'">'+ config.community +'</a>'
              });
              return;
            } else if (error === 'invalid_email') {
              error = 'O email que você inseriu é um email inválido.';
            } else if (error === 'invalid_auth') {
              error = 'Algo deu errado. Por favor entre em contato com um administrador do sistema.';
            }

            res.render('result', {
              community: config.community,
              message: 'Failed! ' + error,
              isFailed: true
            });
          }
        });
    }
    if (!!config.recaptchaSiteKey && !!config.recaptchaSecretKey) {
      request.post({
        url: 'https://www.google.com/recaptcha/api/siteverify',
        form: {
          response: req.body['g-recaptcha-response'],
          secret: config.recaptchaSecretKey
        }
      }, function(err, httpResponse, body) {
        if (typeof body === "string") {
          body = JSON.parse(body);
        }

        if (body.success) {
          doInvite();
        } else {
          error = 'Invalid captcha.';
          res.render('result', {
            community: config.community,
            message: 'Failed! ' + error,
            isFailed: true
          });
        }
      });
    } else {
      doInvite();
    }
  } else {
    const errMsg = [];
    if (!req.body.email) {
      errMsg.push('seu email é obrigatório');
    }

    if (!!config.inviteToken) {
      if (!req.body.token) {
        errMsg.push('token válido é obrigatório');
      }

      if (req.body.token && req.body.token !== config.inviteToken) {
        errMsg.push('o token que você inseriu é inválido');
      }
    }

    res.render('result', {
      community: config.community,
      message: 'Deu ruim! ' + errMsg.join(' and ') + '.',
      isFailed: true
    });
  }
});

router.get('/badge.svg', (req, res) => {
  request.get({
    url: 'https://'+ config.slackUrl + '/api/users.list',
    qs: {
      token: config.slacktoken,
      presence: true
    }
  }, function(err, httpResponse, body) {
    try {
      body = JSON.parse(body);
    } catch(e) {
      return res.status(404).send('');
    }
    if (!body.members) {
      return res.status(404).send('');
    }

    const members = body.members.filter(function(m) {
      return !m.is_bot;
    });
    const total = members.length;
    const presence = members.filter(function(m) {
      return m.presence === 'active';
    }).length;

    res.type('svg');
    res.set('Cache-Control', 'max-age=0, no-cache');
    res.set('Pragma', 'no-cache');
    res.send(badge(presence, total));
  });
});

module.exports = router;
