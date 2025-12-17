# Chat API Documentation

## Base URL
`https://chat.smaiclub.top`

## Endpoints

### 1. Create a Room
**POST** `/api/rooms`

**Headers:**
- `Cookie`: Must contain a valid `auth_token` (from login).

**Body (JSON):**
```json
{
  "name": "My Room Name",
  "isPrivate": true
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "roomId": 12345,
  "roomKey": "abcd123..." // SAVE THIS! It is only shown once.
}
```

### 2. Connect to Room (WebSocket)
**GET** `/api/rooms/:id/websocket`

**Query Parameters:**
- `key`: The `roomKey` returned during creation.

**Example:**
`wss://chat.smaiclub.top/api/rooms/12345/websocket?key=abcd123...`

**WebSocket Payload (Send Message):**
```json
{
  "content": "Hello World"
}
```
*Note: The server encrypts the content and sender name using the Room Key.*

**WebSocket Payload (Receive Message):**
```json
{
  "iv": "...",
  "content": "...",
  "sender": "...",
  "timestamp": 1234567890
}
```
*Note: Clients must decrypt `content` and `sender` using AES-GCM and the Room Key.*

## Emergency Mode
If the server responds with:
```json
{
  "error": "EMERGENCY_MODE",
  "message": "Operation failed..."
}
```
Redirect the user to **Room ID 000001** with Key `smaiclub_issues`.
