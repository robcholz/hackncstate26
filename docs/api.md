# API

## Response Format

### Success

```json
{
  "status": "success",
  "data": {}
}
```

`data`: Response payload object. Shape depends on the endpoint.

### Error

```json
{
  "status": "error",
  "error": {
    "code": "invalid_request",
    "message": "Invalid parameter"
  }
}
```

### Error with Details

```json
{
  "status": "error",
  "error": {
    "code": "invalid_request",
    "message": "Validation failed",
    "details": {}
  }
}
```

## Common Error Codes

- `400 invalid_json`: Malformed JSON body.
- `401 unauthorized`: Missing or invalid bearer token.
- `403 forbidden`: Token valid but does not match, or resource scope.
- `404 not_found`: Resource not found (or not accessible).
- `409 conflict`: Unique constraint violation or conflicting state.
- `429 too_many_requests`: Too many requests. 
- `422 invalid_request`: Validation failed (schema, types, ranges).

## Website Renderer Microservice

### POST `/api/v1/render`

Request to render a url

#### Authentication

This endpoint requires a bearer token in the `Authorization` header.

```http
Authorization: Bearer <WEBSITE_RENDERER_TOKEN>
```

Server behavior:
- If the header is missing or malformed, return `401 unauthorized`.
- If the bearer token does not match the configured renderer token, return `403 forbidden`.

#### Request

```json
{
  "url": "https://github.com",
  "timeout": 3000
}
```

`url`: Required. an url to the web page we request to render (string).  
`timeout`: Required. request timeout in milliseconds.

#### Response

```json
{
  "status": "success",
  "data": {
    "image": "<base64>"
  }
}
```

`data`: Object containing the render result.  
`data.image`: Base64-encoded screenshot of the rendered page (string).

#### Errors

- `401 unauthorized` if `Authorization` header is missing or malformed.
- `403 forbidden` if bearer token does not match server configuration.
- `429 too_many_requests` if the server cannot handle too many requests.

## Backend

Request to render a url

#### Request

```json
{
  "url": "https://github.com",
  "timeout": 3000
}
```

`url`: Required. an url to the web page we request to render (string).  
`timeout`: Required. request timeout in milliseconds.

#### Response

```json
{
  "status": "success",
  "data": {
    "image": "<base64>",
    "sus_index": {
      "rate": 7,
      "domain_similarity": 5,
      "keyword_match": 3,
      "password_input_match": 6
    }
  }
}
```

`data`: Object containing the render result and phishing analysis summary.  
`data.image`: Base64-encoded screenshot of the rendered page (string).  
`data.sus_index`: Suspiciousness scoring breakdown (object).  
`data.sus_index.rate`: Overall suspiciousness score (number).  
`data.sus_index.domain_similarity`: Domain similarity score (number).  
`data.sus_index.keyword_match`: Keyword match score (number).  
`data.sus_index.password_input_match`: Password-input pattern score (number).

#### Errors

- `429 too_many_requests` if the server cannot handle too many requests.
