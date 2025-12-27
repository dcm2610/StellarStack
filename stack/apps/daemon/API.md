# Stellar Daemon API

REST API and WebSocket endpoints for game server management.

**Base URL:** `http://localhost:8080`

**Authentication:** Bearer token in `Authorization` header for API routes.

---

## Endpoints Overview

### Quick Reference Table

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| **System** ||||
| `GET` | `/api/system` | Get system information and stats | Yes |
| **Servers** ||||
| `GET` | `/api/servers` | List all servers | Yes |
| `POST` | `/api/servers` | Create a new server | Yes |
| `GET` | `/api/servers/:id` | Get server details | Yes |
| `DELETE` | `/api/servers/:id` | Delete a server | Yes |
| `POST` | `/api/servers/:id/power` | Power action (start/stop/restart/kill) | Yes |
| `POST` | `/api/servers/:id/commands` | Send console command | Yes |
| `GET` | `/api/servers/:id/logs` | Get console logs | Yes |
| `POST` | `/api/servers/:id/install` | Run installation script | Yes |
| `POST` | `/api/servers/:id/reinstall` | Reinstall server | Yes |
| `POST` | `/api/servers/:id/sync` | Sync configuration with panel | Yes |
| `GET` | `/api/servers/:id/ws` | WebSocket connection | Yes |
| **Files** ||||
| `GET` | `/api/servers/:id/files/list` | List directory contents | Yes |
| `GET` | `/api/servers/:id/files/contents` | Read file contents | Yes |
| `POST` | `/api/servers/:id/files/write` | Write file contents | Yes |
| `POST` | `/api/servers/:id/files/create-directory` | Create directory | Yes |
| `POST` | `/api/servers/:id/files/rename` | Rename file or directory | Yes |
| `POST` | `/api/servers/:id/files/copy` | Copy file or directory | Yes |
| `DELETE` | `/api/servers/:id/files/delete` | Delete files or directories | Yes |
| `POST` | `/api/servers/:id/files/compress` | Create archive | Yes |
| `POST` | `/api/servers/:id/files/decompress` | Extract archive | Yes |
| `POST` | `/api/servers/:id/files/chmod` | Change file permissions | Yes |
| **Backups** ||||
| `GET` | `/api/servers/:id/backup` | List backups | Yes |
| `POST` | `/api/servers/:id/backup` | Create backup | Yes |
| `POST` | `/api/servers/:id/backup/restore` | Restore from backup | Yes |
| `DELETE` | `/api/servers/:id/backup/:backup_id` | Delete backup | Yes |
| **Downloads/Uploads** ||||
| `GET` | `/download/backup` | Download backup file | Token |
| `GET` | `/download/file` | Download server file | Token |
| `POST` | `/upload/file` | Upload file to server | Token |

---

## Authentication

### Bearer Token

All `/api/*` routes require a valid bearer token:

```
Authorization: Bearer <node_token>
```

### Download/Upload Tokens

Download and upload routes use JWT tokens passed as query parameters:

```
GET /download/file?token=<jwt>&server=<uuid>&path=/file.txt
```

---

## System

### GET /api/system

Get system information and resource statistics.

**Response:**
```json
{
  "version": "1.0.0",
  "kernel": "5.15.0-generic",
  "architecture": "x86_64",
  "cpu_count": 8,
  "memory": {
    "total": 17179869184,
    "available": 8589934592,
    "used": 8589934592
  },
  "disk": {
    "total": 500000000000,
    "available": 250000000000,
    "used": 250000000000
  }
}
```

---

## Servers

### GET /api/servers

List all servers on this node.

**Response:**
```json
{
  "servers": [
    {
      "uuid": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Minecraft Server",
      "state": "running",
      "is_installing": false,
      "is_transferring": false,
      "is_restoring": false
    }
  ]
}
```

---

### POST /api/servers

Create a new server.

**Request Body:**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "start_on_completion": true
}
```

**Response (201):**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "status": "created"
}
```

---

### GET /api/servers/:id

Get detailed server information.

**Response:**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Minecraft Server",
  "state": "running",
  "configuration": {
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "suspended": false,
    "invocation": "java -Xms128M -Xmx1024M -jar server.jar",
    "skip_egg_scripts": false,
    "build": {
      "memory_limit": 1024,
      "swap": 0,
      "cpu_limit": 100,
      "disk_space": 10240,
      "io_weight": 500,
      "threads": null
    },
    "container": {
      "image": "ghcr.io/pterodactyl/yolks:java_17",
      "oom_disabled": false
    },
    "allocations": {
      "default": {
        "ip": "0.0.0.0",
        "port": 25565
      },
      "mappings": {
        "25565": 25565
      }
    }
  },
  "resources": {
    "memory_bytes": 536870912,
    "cpu_absolute": 15.5,
    "disk_bytes": 1073741824,
    "network_rx_bytes": 1048576,
    "network_tx_bytes": 524288,
    "uptime": 3600
  }
}
```

---

### DELETE /api/servers/:id

Delete a server and all its data.

**Response:**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "deleted": true
}
```

---

### POST /api/servers/:id/power

Execute a power action on the server.

**Request Body:**
```json
{
  "action": "start",
  "wait_seconds": 0
}
```

| Action | Description |
|--------|-------------|
| `start` | Start the server |
| `stop` | Graceful stop (sends stop command) |
| `restart` | Stop then start |
| `kill` | Force kill (SIGKILL) |

**Response:**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "action": "start",
  "success": true
}
```

---

### POST /api/servers/:id/commands

Send a command to the server console.

**Request Body:**
```json
{
  "commands": ["say Hello World!", "op player123"]
}
```

**Response:**
```json
{
  "success": true
}
```

---

### GET /api/servers/:id/logs

Get recent console logs.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `lines` | integer | `100` | Number of lines to retrieve |

**Response:**
```json
{
  "logs": [
    "[19:00:00] [Server] Starting minecraft server...",
    "[19:00:05] [Server] Done! For help, type \"help\""
  ]
}
```

---

### POST /api/servers/:id/install

Run the server installation script.

**Response:**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "status": "installing"
}
```

---

### POST /api/servers/:id/reinstall

Reinstall the server (delete data and run install).

**Response:**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "status": "reinstalling"
}
```

---

### POST /api/servers/:id/sync

Sync server configuration with the panel.

**Response:**
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "synced": true
}
```

---

## WebSocket

### GET /api/servers/:id/ws

Establish a WebSocket connection for real-time console and stats.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | JWT authentication token |

**Connection URL:**
```
ws://localhost:8080/api/servers/550e8400.../ws?token=<jwt>
```

**Incoming Messages (from server):**

Authentication success:
```json
{
  "event": "auth success",
  "args": []
}
```

Console output:
```json
{
  "event": "console output",
  "args": ["[19:00:00] Server started"]
}
```

Server status change:
```json
{
  "event": "status",
  "args": ["running"]
}
```

Resource stats:
```json
{
  "event": "stats",
  "args": [{
    "memory_bytes": 536870912,
    "memory_limit_bytes": 1073741824,
    "cpu_absolute": 15.5,
    "network": {
      "rx_bytes": 1048576,
      "tx_bytes": 524288
    },
    "uptime": 3600,
    "state": "running"
  }]
}
```

Installation output:
```json
{
  "event": "install output",
  "args": ["Downloading server files..."]
}
```

Installation completed:
```json
{
  "event": "install completed",
  "args": [{"successful": true}]
}
```

**Outgoing Messages (to server):**

Set power state:
```json
{
  "event": "set state",
  "args": ["start"]
}
```

Send command:
```json
{
  "event": "send command",
  "args": ["say Hello!"]
}
```

Request logs:
```json
{
  "event": "send logs",
  "args": []
}
```

Request stats:
```json
{
  "event": "send stats",
  "args": []
}
```

---

## Files

### GET /api/servers/:id/files/list

List directory contents.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `directory` | string | `/` | Path to list |

**Response:**
```json
{
  "files": [
    {
      "name": "server.properties",
      "created": "2025-12-26T19:00:00Z",
      "modified": "2025-12-26T19:30:00Z",
      "size": 1234,
      "mode": "0644",
      "mode_bits": "-rw-r--r--",
      "is_file": true,
      "is_symlink": false,
      "is_editable": true,
      "mime_type": "text/plain"
    },
    {
      "name": "world",
      "created": "2025-12-26T18:00:00Z",
      "modified": "2025-12-26T19:30:00Z",
      "size": 4096,
      "mode": "0755",
      "mode_bits": "drwxr-xr-x",
      "is_file": false,
      "is_symlink": false,
      "is_editable": false,
      "mime_type": "inode/directory"
    }
  ]
}
```

---

### GET /api/servers/:id/files/contents

Read file contents.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file` | string | Yes | Path to file |

**Response:**
```json
{
  "content": "motd=A Minecraft Server\nmax-players=20\n..."
}
```

---

### POST /api/servers/:id/files/write

Write content to a file.

**Request Body:**
```json
{
  "file": "/server.properties",
  "content": "motd=My Server\nmax-players=50"
}
```

**Response:**
```json
{
  "success": true
}
```

---

### POST /api/servers/:id/files/create-directory

Create a new directory.

**Request Body:**
```json
{
  "name": "plugins",
  "path": "/"
}
```

**Response:**
```json
{
  "success": true
}
```

---

### POST /api/servers/:id/files/rename

Rename or move a file/directory.

**Request Body:**
```json
{
  "from": "/old-name.txt",
  "to": "/new-name.txt"
}
```

**Response:**
```json
{
  "success": true
}
```

---

### POST /api/servers/:id/files/copy

Copy a file or directory.

**Request Body:**
```json
{
  "location": "/server.properties"
}
```

**Response:**
```json
{
  "success": true
}
```

---

### DELETE /api/servers/:id/files/delete

Delete files or directories.

**Request Body:**
```json
{
  "files": ["/logs/old.log", "/temp"]
}
```

**Response:**
```json
{
  "success": true
}
```

---

### POST /api/servers/:id/files/compress

Create a compressed archive.

**Request Body:**
```json
{
  "root": "/",
  "files": ["world", "server.properties"]
}
```

**Response:**
```json
{
  "archive": {
    "name": "archive-1703617200.tar.gz",
    "size": 52428800
  }
}
```

---

### POST /api/servers/:id/files/decompress

Extract an archive.

**Request Body:**
```json
{
  "file": "/archive.tar.gz"
}
```

**Response:**
```json
{
  "success": true
}
```

---

### POST /api/servers/:id/files/chmod

Change file permissions.

**Request Body:**
```json
{
  "files": ["/script.sh"],
  "mode": "0755"
}
```

**Response:**
```json
{
  "success": true
}
```

---

## Backups

### GET /api/servers/:id/backup

List all backups for this server.

**Response:**
```json
{
  "backups": [
    {
      "uuid": "backup-550e8400-e29b-41d4",
      "name": "daily-backup",
      "size": 104857600,
      "checksum": "sha256:a1b2c3d4...",
      "created_at": "2025-12-26T00:00:00Z",
      "is_locked": false
    }
  ]
}
```

---

### POST /api/servers/:id/backup

Create a new backup.

**Request Body:**
```json
{
  "uuid": "backup-550e8400-e29b-41d4",
  "ignore": ["logs", "cache", "*.tmp"],
  "is_locked": false
}
```

**Response:**
```json
{
  "uuid": "backup-550e8400-e29b-41d4",
  "size": 52428800,
  "checksum": "sha256:e5f6g7h8...",
  "status": "completed"
}
```

---

### POST /api/servers/:id/backup/restore

Restore server from a backup.

**Request Body:**
```json
{
  "uuid": "backup-550e8400-e29b-41d4",
  "truncate": true
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `uuid` | string | Required | Backup UUID |
| `truncate` | boolean | `false` | Delete existing files before restore |

**Response:**
```json
{
  "uuid": "backup-550e8400-e29b-41d4",
  "status": "restored"
}
```

---

### DELETE /api/servers/:id/backup/:backup_id

Delete a backup.

**Response:**
```json
{
  "uuid": "backup-550e8400-e29b-41d4",
  "deleted": true
}
```

---

## Downloads & Uploads

### GET /download/backup

Download a backup file.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | JWT download token |

**Response:** Binary `.tar.gz` file

---

### GET /download/file

Download a server file.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | JWT download token |

**Response:** Binary file with appropriate Content-Type

---

### POST /upload/file

Upload a file to a server.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | JWT upload token |
| `directory` | string | No | Target directory (default: `/`) |

**Request:** Multipart form data with file(s)

**Response:**
```json
{
  "success": true,
  "files": ["/plugins/myplugin.jar"]
}
```

---

## SFTP Server

The daemon includes an embedded SFTP server for file management.

**Default Port:** `2022`

**Connection:**
```bash
sftp -P 2022 <server_uuid>.<user_uuid>@localhost
```

**Username Format:** `<server_uuid>.<user_uuid>`

**Password:** User's panel password or API key

---

## Error Responses

All errors follow this format:

```json
{
  "error": "error_code",
  "message": "Human readable error message"
}
```

| Status Code | Error Code | Description |
|-------------|------------|-------------|
| 400 | `bad_request` | Invalid request body or parameters |
| 401 | `unauthorized` | Missing or invalid authentication |
| 403 | `forbidden` | Permission denied |
| 404 | `not_found` | Server or resource not found |
| 409 | `conflict` | Server is busy (installing/transferring) |
| 500 | `internal_error` | Internal server error |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STELLAR_DEBUG` | `false` | Enable debug logging |
| `STELLAR_API_HOST` | `0.0.0.0` | API bind address |
| `STELLAR_API_PORT` | `8080` | API bind port |
| `STELLAR_DATA_DIR` | `/var/lib/stellar/volumes` | Server data directory |
| `STELLAR_BACKUP_DIR` | `/var/lib/stellar/backups` | Backup storage directory |
| `STELLAR_SFTP_PORT` | `2022` | SFTP server port |
| `STELLAR_PANEL_URL` | - | Panel API URL |
| `STELLAR_NODE_TOKEN_ID` | - | Node authentication ID |
| `STELLAR_NODE_TOKEN` | - | Node authentication token |

### config.yml

```yaml
debug: false

api:
  host: "0.0.0.0"
  port: 8080
  ssl:
    enabled: false
    cert: ""
    key: ""
  upload_limit: 100

system:
  root_directory: /var/lib/stellar
  data_directory: /var/lib/stellar/volumes
  backup_directory: /var/lib/stellar/backups
  log_directory: /var/log/stellar

docker:
  socket: /var/run/docker.sock
  network:
    name: stellar
    driver: bridge

remote:
  url: "https://panel.example.com"
  token_id: "node_abc123"
  token: "secret_token"
  timeout: 30

sftp:
  bind_address: "0.0.0.0"
  bind_port: 2022
  read_only: false
```
