# Create and refresh token

This endpoint is used to create or refresh the necessary Access Token to operate your application.

**POST** `/oauth/token`

## Request parameters

- `client_secret` (string, optional)
  Private key to be used in some plugins to generate payments. One of the keys in the pair that make up the credentials that identify an application/integration in your account.

- `client_id` (string, optional)
  Unique ID that identifies your application/integration. One of the keys in the pair that make up the credentials that identify an application/integration in your account.

- `grant_type` (string, optional)
  Specify the type of operation to be performed to obtain your Access Token. In the case of Mercado Pago, there are three available access flows:
Possible enum values:

  - `authorization_code`
  A flow based on redirection, characterized by user intervention to explicitly authorize the application to access their data and by the use of a code provided by the authentication server so that the application can obtain an Access Token and an associated 'refresh_token'.

  - `refresh_token`
  If an Access Token generated from the 'authorization_code' flow is invalid or expired, this flow will be used to exchange a temporary grant of the 'refresh_token' type for an Access Token. This allows the Access Token to be refreshed without requiring further user interaction after the authorization granted by the 'authorization_code' flow.

  - `client_credentials`
  Used to obtain an Access Token without user interaction. This flow is used when applications request an Access Token using only their own credentials to access their own resources, without acting on behalf of a user or accessing their data.

- `code` (string, optional)
  Code provided by the authentication server so that the application can obtain an Access Token and an associated 'refresh_token'. It is valid for 10 minutes counted from its generation. Required when grant_type=authorization_code.

- `code_verifier` (string, optional)
  Code generated when PKCE verification has been enabled and configured for generating the Access Token from the 'authorization_code' flow.

- `redirect_uri` (string, optional)
  URL reported in the 'Redirect URLs' field of your application. Make sure that the 'redirect_uri' is a static URL. Required only when grant_type=authorization_code.

- `refresh_token` (string, optional)
  Value received when the Access Token is created. Only required when grant_type=refresh_token.

- `test_token` (string, optional)
  Added with value = true only when you want to generate credentials for testing.

## Response parameters

- `access_token` (string, optional)
  Security code that identifies the user, their privileges and an application used in different requests from public sources to access protected resources. Its validity is determined by the expires_in parameter and is similar to APP_USR-1585551492-030918-25######3458-2880736, which is composed of:
Possible enum values:

  - `Access Token type`
  APP_USR (application on behalf of a user), TEST (test, only valid in sandbox)

  - `Client ID`
  1585551492

  - `Creation date (MMddHH)`
  030918

  - `Security hash`
  25######3458

  - `User ID`
  2880736

- `token_type` (string, optional)
  necessary information for the token to be used correctly to access protected resources. The token of type "bearer" is the only one supported by the authorization server and is used when the Access Token is included as plain text in the request. It is understood that the bearer has direct access to the token.

- `expires_in` (number, optional)
  Fixed access_token expiration time expressed in seconds. By default, the expiration time is 180 days (15552000 seconds).

- `scope` (string, optional)
  Scopes are used in the API authorization and consent process and allow you to determine what access the application requests and what access the user grants. By default, the scopes associated with the token are the ones determined when creating the original token and configuring the application.

- `user_id` (number, optional)
  Identification number (Mercado Pago ID) generated automatically when creating a Mercado Pago account. It is a unique number that identifies the Mercado Pago seller and is the owner of the application.

- `refresh_token` (string, optional)
  Temporary grants code used to obtain access tokens so that authorization and access to resources remain valid before the end of the Access Token's validity period. They define an ID used to retrieve authorization information. Unlike access tokens, refresh tokens can only be used for calls on the authorization server and are never sent to resource servers. The 'refresh_token' can only be used once and only for the client_id it is associated with. After a refreh_token is used it will become invalid.

- `public_key` (string, optional)
  Public key of the application that will normally be used in the frontend and will allow, for example, knowing the means of payment and encrypting the card data. One of the keys in the pair that make up the credentials that identify an application/integration in your account.

- `live_mode` (boolean, optional)
  Indicates whether the application is in production or test mode.

## Errors

| Status | Error | Description |
| ------- | ------- | ----------- |
| 400 | invalid_client | The provided client_id and/or client_secret of your app is invalid. |
| 400 | invalid_grant | There are several reasons for this error, it could be because the authorization_code or refresh_token is invalid, expired or revoked, was sent in an incorrect flow, belongs to another client, or the redirect_uri used in the authorization flow does not match what your application has configured. |
| 400 | invalid_scope | The requested scope is invalid, unknown, or wrongly formed. The allowed values for the scope parameter are “offline_access”, ”write” or ”read”. |
| 400 | invalid_request | The request does not include a required parameter, includes an unsupported parameter or parameter value, has a duplicated value, or is otherwise malformed. |
| 400 | unsupported_grant_type | Allowed values for grant_type are “authorization_code” or “refresh_token”. |
| 400 | forbidden | The call does not authorize access, possibly another user's token is being used. |
| 400 | unauthorized_client | The application does not have a grant with the user or the permissions (scopes) that the application has with this user do not allow creating a token. |
| 429 | local_rate_limited | The call does not authorize access, please try again. |

## Request example

### cURL

```bash
curl -X POST \
  'https://api.mercadopago.com/oauth/token' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -d '{
  "client_secret": "client_secret",
  "client_id": "client_id",
  "grant_type": "client_credentials",
  "code": "TG-XXXXXXXX-241983636",
  "code_verifier": "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU",
  "redirect_uri": "https://www.mercadopago.com.br/developers/example/redirect-url",
  "refresh_token": "TG-XXXXXXXX-241983636",
  "test_token": "false"
  }'
```

## Response example

```json
{
  "access_token": "APP_USR-4934588586838432-XXXXXXXX-241983636",
  "token_type": "bearer",
  "expires_in": 15552000,
  "scope": "read write offline_access",
  "user_id": 241983636,
  "refresh_token": "TG-XXXXXXXX-241983636",
  "public_key": "APP_USR-d0a26210-XXXXXXXX-479f0400869e",
  "live_mode": true
}
```
