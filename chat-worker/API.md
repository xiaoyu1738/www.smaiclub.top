# Chat API Documentation

## Base URL
`https://chat-api.smaiclub.top`

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

**Example:**
`wss://chat-api.smaiclub.top/api/rooms/12345/websocket?since=1234567890`

The Worker sends a handshake payload with salt, iteration count, and a nonce.
The client derives the room access verifier from the room key, signs the nonce,
and sends `{ "type": "auth", "signature": "..." }`.

**WebSocket Payload (Send Message):**
```json
{
  "iv": "...",
  "content": "...",
  "tempId": "temp_123"
}
```
Clients encrypt message content with AES-GCM before sending. The Worker stores
and broadcasts ciphertext.

**WebSocket Payload (Receive Message):**
```json
{
  "iv": "...",
  "content": "...",
  "sender": "...",
  "timestamp": 1234567890
}
```
Clients decrypt `content` locally with the room key.

## Emergency Mode
If the server responds with:
```json
{
  "error": "EMERGENCY_MODE",
  "message": "Operation failed..."
}
```
Redirect the user to **Room ID 000001** with Key `smaiclub_issues`.
