# Single sign-on with authentik

How to let people sign in to Unitati through [authentik](https://goauthentik.io/) with OpenID
Connect. The design is in [ADR 0056](adr/0056-single-sign-on-with-oidc-and-scim.md); any OpenID
Connect provider that offers discovery and a verified-email claim works the same way.

You need an authentik instance reachable by Unitati's server (it fetches the discovery document and
the keys, and exchanges the code) and by your users' browsers, and a Unitati installation served over
the public origin in `BETTER_AUTH_URL`.

## 1. Create the provider and the application in authentik

1. **Applications → Providers → Create → OAuth2/OpenID Provider.**
   - **Name:** `Unitati`.
   - **Authorization flow:** the explicit or implicit consent flow you use for other applications.
   - **Client type:** _Confidential_. Authentik generates the **Client ID** and **Client Secret**;
     you will need both.
   - **Redirect URIs/Origins (RegEx):** one **strict** entry with Unitati's callback,
     `https://unitati.example.org/api/auth/sso/callback/oidc` (your `BETTER_AUTH_URL` plus
     `/api/auth/sso/callback/oidc`). Unitati repeats the exact value in **Ajustes → Plataforma →
     Autenticación**.
   - **Signing Key:** any authentik signing key (RS256).
   - **Scopes:** `openid`, `email` and `profile`. Do not add a `groups` mapping to expect roles:
     Unitati ignores the claim; roles come from SCIM in a later release.
   - **Issuer mode:** _Each provider has a different issuer_ (the default).
2. **Applications → Applications → Create**, name `Unitati`, slug `unitati`, and pick the provider.
3. Open the provider's page and copy the **OpenID Configuration Issuer**, for example
   `https://authentik.example.org/application/o/unitati/`. Keep it **exactly as shown, trailing slash
   included**: Unitati compares it to the `iss` claim, and it is part of how an identity is stored.

## 2. Make `email_verified` true

Unitati links a person to an identity by email **once**, and only when the ID token says the address
is verified. Two things have to hold in authentik:

- **The `email` scope mapping reports `email_verified: true`.** The default mapping
  (_authentik default OAuth Mapping: OpenID 'email'_) does. If you replaced it with your own, make
  it return `{"email": request.user.email, "email_verified": True}`. If it reports `false`, Unitati
  refuses the sign-in and the error page says the email is not verified.
- **Users cannot edit their own email.** Otherwise "verified" means nothing: someone could type a
  colleague's address and be linked to their person. In **System → Settings**, turn off _Allow users
  to change email_, and do not expose the email attribute for self-service in your user settings
  flow.

## 3. Bind who may access the application

Unitati lets in whoever the provider authenticates and who resolves to an active person, so **the
list of people allowed in is authentik's**. Open the application, go to **Policy / Group / User
Bindings** and bind the groups or users that may use Unitati. An application with no bindings is open
to every authentik user.

## 4. Set the variables in Unitati

```sh
OIDC_ISSUER="https://authentik.example.org/application/o/unitati/"
OIDC_CLIENT_ID="<client id from authentik>"
OIDC_CLIENT_SECRET="<client secret from authentik>"
```

All three or none: a partial set stops the server at start. The secret is only ever read from the
environment; Unitati never stores it. Restart Unitati. The sign-in screen now shows **Entrar con
SSO**, and **Ajustes → Plataforma → Autenticación** appears for admins.

## 5. Tune it in Unitati

In **Ajustes → Plataforma → Autenticación**:

- **Texto del botón:** the "SSO" in "Entrar con SSO".
- **Alta automática de personas:** with it off, only people already in the directory can sign in; with
  it on, an authenticated identity with no matching person is created as an employee.
- **Inicio de sesión único obligatorio:** only the SSO button is shown. Turning it on ends the
  password sessions of everyone who is not an admin and refuses their passwords until you turn it
  off. Admins keep signing in with a password at `/login/local`, which no setting can disable: keep
  an admin password that you know.
- **Redirigir automáticamente:** with SSO required, `/login` goes straight to authentik, except after
  an SSO error or after signing out.

## What to expect

- The first sign-in of someone already in the directory links them by email and gives them a user
  with role _employee_. Change the role in **Directorio** as before.
- Name and email follow authentik on every sign-in and are read-only in the directory for a linked
  person. **Desvincular cuenta SSO** (admins) makes them editable again and ends their SSO sessions.
- An SSO session lasts 12 hours and is not refreshed, so a leaver loses access within a working day
  even though you deactivate them only in authentik.
- If a new person at authentik gets an email that an old, deactivated person still holds in the
  directory, the sign-in is refused and **Autenticación** lists a warning. Edit the old person's email
  in **Directorio** (allowed for inactive people), dismiss the warning, and the new person can sign in.
- Signing out of Unitati does not sign you out of authentik or of any other application.

## Troubleshooting

| Symptom                                                  | Likely cause                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Unitati will not start: "set all together or not at all" | One or two of the three variables are empty.                                                       |
| "El inicio de sesión único no está bien configurado"     | Unitati cannot fetch the discovery document: check `OIDC_ISSUER` and that the server can reach it. |
| Authentik says the redirect URI does not match           | The strict redirect URI differs from the one in Unitati's settings, scheme and host included.      |
| "Tu proveedor de identidad no ha confirmado tu correo"   | `email_verified` is false: see step 2.                                                             |
| "No hay nadie en el directorio con tu correo"            | The person does not exist and **Alta automática** is off, or their email differs.                  |
