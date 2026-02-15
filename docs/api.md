# API

## Response Format

### Success

```json
{
  "status": "success",
  "data": {}
}
```

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

#### Errors

- `429 too_many_requests` if the server cannot handle too many requests.
