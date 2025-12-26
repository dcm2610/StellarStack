# Stellar Daemon API

REST API and WebSocket endpoints for Docker container management.

**Base URL:** `http://localhost:3001`

---

## Health

### GET /health

Check daemon and Docker connectivity status.

**Response:**
```json
{
  "status": "healthy",
  "docker": true
}
```

---

## Containers

### GET /containers

List all containers.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `all` | boolean | `false` | Include stopped containers |

**Response:**
```json
[
  {
    "id": "abc123...",
    "name": "minecraft-server",
    "image": "itzg/minecraft-server:latest",
    "state": "running",
    "status": "Up 2 hours",
    "created": "2025-12-26T19:00:00Z",
    "ports": [
      {
        "container_port": 25565,
        "host_port": 25565,
        "host_ip": "0.0.0.0",
        "protocol": "tcp"
      }
    ],
    "labels": {}
  }
]
```

---

### POST /containers

Create and start a new container from a Blueprint.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | string | auto-generated | Custom container name |

**Request Body (Blueprint):**
```json
{
  "name": "minecraft-server",
  "description": "Minecraft Java Server",
  "category": "gaming",
  "image": {
    "name": "itzg/minecraft-server",
    "tag": "latest",
    "registry": null
  },
  "stdin_open": true,
  "tty": true,
  "ports": [
    {
      "container_port": 25565,
      "host_port": 25565,
      "host_ip": "0.0.0.0",
      "protocol": "tcp"
    }
  ],
  "environment": {
    "EULA": "TRUE",
    "TYPE": "VANILLA"
  },
  "resources": {
    "memory": 4294967296,
    "memory_swap": null,
    "cpus": 2.0,
    "cpu_shares": null,
    "cpu_period": null,
    "cpu_quota": null,
    "cpuset_cpus": null,
    "cpuset_mems": null,
    "nano_cpus": null
  },
  "mounts": [
    {
      "source": "/host/path",
      "target": "/container/path",
      "read_only": false,
      "type": "bind"
    }
  ],
  "volumes": [
    {
      "name": "minecraft-data",
      "target": "/data",
      "read_only": false
    }
  ],
  "command": null,
  "entrypoint": null,
  "working_dir": null,
  "user": null,
  "restart_policy": "unlessstopped",
  "network_mode": null,
  "hostname": null,
  "labels": {}
}
```

**Response (201 Created):**
```json
{
  "id": "abc123def456...",
  "name": "minecraft-server-a1b2c3d4",
  "warnings": []
}
```

---

### GET /containers/{id}

Get detailed information about a container.

**Response:**
```json
{
  "id": "abc123...",
  "name": "minecraft-server",
  "image": "itzg/minecraft-server:latest",
  "state": "running",
  "status": "RUNNING",
  "created": "2025-12-26T19:00:00Z",
  "ports": [],
  "labels": {}
}
```

---

### DELETE /containers/{id}

Remove a container.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `force` | boolean | `false` | Force remove running container |

**Response:**
```json
{
  "action": "remove",
  "container_id": "abc123...",
  "success": true,
  "message": "Container removed"
}
```

---

### POST /containers/{id}/start

Start a stopped container.

**Response:**
```json
{
  "action": "start",
  "container_id": "abc123...",
  "success": true,
  "message": "Container started"
}
```

---

### POST /containers/{id}/stop

Stop a running container.

**Request Body (optional):**
```json
{
  "timeout": 10
}
```

**Response:**
```json
{
  "action": "stop",
  "container_id": "abc123...",
  "success": true,
  "message": "Container stopped"
}
```

---

### POST /containers/{id}/restart

Restart a container.

**Request Body (optional):**
```json
{
  "timeout": 10
}
```

**Response:**
```json
{
  "action": "restart",
  "container_id": "abc123...",
  "success": true,
  "message": "Container restarted"
}
```

---

### POST /containers/{id}/kill

Kill a container with a signal.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `signal` | string | `SIGKILL` | Signal to send |

**Response:**
```json
{
  "action": "kill",
  "container_id": "abc123...",
  "success": true,
  "message": "Container killed"
}
```

---

### GET /containers/{id}/stats

Get current container resource statistics.

**Response:**
```json
{
  "id": "abc123...",
  "name": "minecraft-server",
  "cpu": {
    "usage_percent": 15.5,
    "system_cpu_usage": 123456789,
    "online_cpus": 8
  },
  "memory": {
    "usage": 1073741824,
    "limit": 4294967296,
    "usage_percent": 25.0,
    "cache": 0
  },
  "network": {
    "rx_bytes": 1048576,
    "tx_bytes": 524288,
    "rx_packets": 1000,
    "tx_packets": 500,
    "rx_errors": 0,
    "tx_errors": 0
  },
  "block_io": {
    "read_bytes": 104857600,
    "write_bytes": 52428800
  },
  "pids": 42,
  "timestamp": "2025-12-26T19:30:00Z"
}
```

---

### GET /containers/{id}/logs

Get container logs.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `tail` | string | `"100"` | Number of lines from end |

**Response:**
```json
[
  {
    "type": "stdout",
    "data": "[Server] Starting minecraft server...",
    "timestamp": "2025-12-26T19:00:00Z"
  },
  {
    "type": "stderr",
    "data": "[WARN] Something happened",
    "timestamp": "2025-12-26T19:00:01Z"
  }
]
```

---

## WebSocket Endpoints

### WS /containers/{id}/console

Bidirectional console access for interactive containers.

> **Important:** Container must be created with `stdin_open: true` and `tty: true` for commands to work.

**Connection:** `ws://localhost:3001/containers/{id}/console`

**Incoming Messages (from server):**
```json
{
  "type": "connected",
  "data": { "container_id": "abc123..." }
}
```

```json
{
  "type": "log",
  "data": {
    "type": "stdout",
    "data": "[Server] Player joined the game",
    "timestamp": "2025-12-26T19:30:00Z"
  }
}
```

```json
{
  "type": "error",
  "data": "Container not found: abc123"
}
```

**Outgoing Messages (to server):**

JSON format:
```json
{"type": "command", "data": "op marquescoding"}
```

Or raw text:
```
op marquescoding
```

**JavaScript Example:**
```javascript
const ws = new WebSocket('ws://localhost:3001/containers/abc123/console');

ws.onopen = () => {
  console.log('Connected to console');
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'log') {
    console.log(`[${msg.data.type}] ${msg.data.data}`);
  } else if (msg.type === 'error') {
    console.error(msg.data);
  }
};

// Send a command
ws.send(JSON.stringify({ type: 'command', data: 'op marquescoding' }));

// Or send raw text
ws.send('say Hello World!');
```

---

### WS /containers/{id}/stats/ws

Live streaming container statistics.

**Connection:** `ws://localhost:3001/containers/{id}/stats/ws`

**Incoming Messages:**
```json
{
  "type": "connected",
  "data": { "container_id": "abc123..." }
}
```

```json
{
  "type": "stats",
  "data": {
    "id": "abc123...",
    "name": "minecraft-server",
    "cpu": {
      "usage_percent": 15.5,
      "system_cpu_usage": 123456789,
      "online_cpus": 8
    },
    "memory": {
      "usage": 1073741824,
      "limit": 4294967296,
      "usage_percent": 25.0,
      "cache": 0
    },
    "network": {
      "rx_bytes": 1048576,
      "tx_bytes": 524288,
      "rx_packets": 1000,
      "tx_packets": 500,
      "rx_errors": 0,
      "tx_errors": 0
    },
    "block_io": {
      "read_bytes": 104857600,
      "write_bytes": 52428800
    },
    "pids": 42,
    "timestamp": "2025-12-26T19:30:00Z"
  }
}
```

**JavaScript Example:**
```javascript
const ws = new WebSocket('ws://localhost:3001/containers/abc123/stats/ws');

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'stats') {
    console.log(`CPU: ${msg.data.cpu.usage_percent.toFixed(1)}%`);
    console.log(`Memory: ${msg.data.memory.usage_percent.toFixed(1)}%`);
  }
};
```

---

## Blueprint Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Blueprint name |
| `description` | string | No | Description |
| `category` | string | No | Category for organization |
| `image` | object | Yes | Docker image configuration |
| `image.name` | string | Yes | Image name |
| `image.tag` | string | No | Image tag (default: `latest`) |
| `image.registry` | string | No | Custom registry |
| `stdin_open` | boolean | No | Enable stdin (required for console) |
| `tty` | boolean | No | Allocate TTY (required for console) |
| `ports` | array | No | Port mappings |
| `environment` | object | No | Environment variables |
| `resources` | object | No | Resource limits (see below) |
| `resources.memory` | integer | No | Memory limit in bytes |
| `resources.cpus` | float | No | CPU cores (e.g., `1.0` = 1 core, `0.5` = half, `2.5` = 2.5 cores) |
| `resources.cpuset_cpus` | string | No | Pin to specific CPUs (e.g., `"0,1"` or `"0-3"`) |
| `mounts` | array | No | Bind mounts |
| `volumes` | array | No | Named volumes |
| `command` | array | No | Override CMD |
| `entrypoint` | array | No | Override ENTRYPOINT |
| `working_dir` | string | No | Working directory |
| `user` | string | No | User to run as |
| `restart_policy` | string | No | `no`, `always`, `onfailure`, `unlessstopped` |
| `network_mode` | string | No | Network mode |
| `hostname` | string | No | Container hostname |
| `labels` | object | No | Container labels |

---

## File Management

### GET /containers/{id}/files

List files in a container directory.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `path` | string | `/` | Directory path to list |

**Response:**
```json
{
  "path": "/data",
  "files": [
    {
      "name": "server.properties",
      "path": "/data/server.properties",
      "type": "file",
      "size": 1234,
      "modified": "2025-12-26T19:00:00",
      "permissions": "-rw-r--r--"
    },
    {
      "name": "world",
      "path": "/data/world",
      "type": "directory",
      "size": 4096,
      "modified": "2025-12-26T18:00:00",
      "permissions": "drwxr-xr-x"
    }
  ]
}
```

---

### GET /containers/{id}/files/read

Get file contents as text.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Path to file |

**Response:** Plain text file contents

---

### GET /containers/{id}/files/download

Download file as binary attachment.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Path to file |

**Response:** Binary file with Content-Disposition header

---

### POST /containers/{id}/files/write

Write content to a file.

**Request Body:**
```json
{
  "path": "/data/server.properties",
  "content": "motd=My Server\nmax-players=20"
}
```

**Response:**
```json
{
  "success": true,
  "path": "/data/server.properties"
}
```

---

### POST /containers/{id}/files/create

Create a file or directory.

**Request Body:**
```json
{
  "path": "/data/plugins/myplugin",
  "type": "directory"
}
```

Or for a file:
```json
{
  "path": "/data/config.yml",
  "type": "file",
  "content": "enabled: true"
}
```

**Response:**
```json
{
  "success": true,
  "path": "/data/plugins/myplugin",
  "type": "directory"
}
```

---

### DELETE /containers/{id}/files/delete

Delete a file or directory.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Path to delete |

**Response:**
```json
{
  "success": true,
  "path": "/data/old-config.yml"
}
```

---

### POST /containers/{id}/files/rename

Rename or move a file/directory.

**Request Body:**
```json
{
  "from": "/data/old-name.txt",
  "to": "/data/new-name.txt"
}
```

**Response:**
```json
{
  "success": true,
  "from": "/data/old-name.txt",
  "to": "/data/new-name.txt"
}
```

---

### POST /containers/{id}/files/archive

Create a tar.gz archive.

**Request Body:**
```json
{
  "path": "/data",
  "destination": "/data/backup.tar.gz",
  "files": ["world", "server.properties"]
}
```

**Response:**
```json
{
  "success": true,
  "archive": "/data/backup.tar.gz"
}
```

---

### POST /containers/{id}/files/extract

Extract an archive.

**Request Body:**
```json
{
  "archive_path": "/data/backup.tar.gz",
  "destination": "/data/restored"
}
```

Supported formats: `.tar.gz`, `.tgz`, `.tar`, `.zip`

**Response:**
```json
{
  "success": true,
  "extracted_to": "/data/restored"
}
```

---

### POST /containers/{id}/files/upload/{path}

Upload files via multipart form.

**Path Parameter:** Target directory path

**Request:** Multipart form with file(s)

**Response:**
```json
{
  "success": true,
  "uploaded": ["/data/uploads/plugin.jar"]
}
```

---

## Backups

Backups always include the entire `/data` directory. You can optionally exclude files/directories and lock backups to prevent accidental deletion.

### GET /containers/{id}/backups

List all backups for a container.

**Response:**
```json
[
  {
    "id": "backup_20251226_190000",
    "container_id": "abc123...",
    "name": "backup",
    "size": 104857600,
    "hash": "a1b2c3d4...",
    "created_at": "20251226_190000",
    "storage": "local",
    "locked": false
  }
]
```

---

### POST /containers/{id}/backups

Create a new backup of the `/data` directory.

**Request Body:**
```json
{
  "name": "before-update",
  "ignore": ["logs", "cache", "*.tmp"],
  "locked": true
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | `"backup"` | Backup name prefix |
| `ignore` | array | `[]` | Files/directories to exclude |
| `locked` | boolean | `false` | Lock backup to prevent deletion |

**Response:**
```json
{
  "id": "before-update_20251226_190000",
  "container_id": "abc123...",
  "name": "before-update",
  "size": 52428800,
  "hash": "e5f6g7h8...",
  "created_at": "20251226_190000",
  "storage": "local",
  "locked": true
}
```

---

### GET /containers/{id}/backups/download

Download a backup file.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Backup ID |

**Response:** Binary `.tar.gz` file

---

### POST /containers/{id}/backups/restore

Restore from a backup.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Backup ID |

**Response:**
```json
{
  "success": true,
  "id": "before-update_20251226_190000",
  "message": "Backup restored successfully"
}
```

---

### PATCH /containers/{id}/backups/lock

Lock or unlock a backup.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Backup ID |

**Request Body:**
```json
{
  "locked": true
}
```

**Response:**
```json
{
  "success": true,
  "id": "before-update_20251226_190000",
  "locked": true
}
```

---

### DELETE /containers/{id}/backups/delete

Delete a backup. Locked backups cannot be deleted until unlocked.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Backup ID |

**Response:**
```json
{
  "success": true,
  "id": "before-update_20251226_190000"
}
```

**Error (if locked):**
```json
{
  "error": true,
  "message": "Cannot delete locked backup. Unlock it first."
}
```

---

## Schedules

Schedules are cron-based tasks that persist across daemon restarts.

### GET /containers/{id}/schedules

List all schedules for a container.

**Response:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "container_id": "abc123...",
    "name": "Daily Backup",
    "cron": "0 0 * * *",
    "action": {
      "backup": {
        "name": "daily",
        "paths": ["/data"]
      }
    },
    "enabled": true,
    "last_run": "2025-12-25T00:00:00Z",
    "next_run": "2025-12-26T00:00:00Z",
    "created_at": "2025-12-01T10:00:00Z"
  }
]
```

---

### POST /containers/{id}/schedules

Create a new schedule.

**Request Body:**
```json
{
  "name": "Hourly Restart",
  "cron": "0 * * * *",
  "action": {
    "restart": {}
  },
  "enabled": true
}
```

**Action Types:**

| Action | Description | Example |
|--------|-------------|---------|
| `command` | Execute a command | `{"command": {"command": "say Server restarting!"}}` |
| `restart` | Restart container | `{"restart": {}}` |
| `start` | Start container | `{"start": {}}` |
| `stop` | Stop container | `{"stop": {}}` |
| `kill` | Kill container | `{"kill": {}}` |
| `backup` | Create backup | `{"backup": {"name": "auto", "ignore": ["logs"], "locked": false}}` |

**Cron Expression Examples:**
| Expression | Description |
|------------|-------------|
| `0 0 * * *` | Daily at midnight |
| `0 * * * *` | Every hour |
| `*/15 * * * *` | Every 15 minutes |
| `0 0 * * 0` | Weekly on Sunday |
| `0 0 1 * *` | Monthly on 1st |

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "container_id": "abc123...",
  "name": "Hourly Restart",
  "cron": "0 * * * *",
  "action": {"restart": {}},
  "enabled": true,
  "last_run": null,
  "next_run": "2025-12-26T20:00:00Z",
  "created_at": "2025-12-26T19:30:00Z"
}
```

---

### GET /containers/{id}/schedules/{schedule_id}

Get a specific schedule.

**Response:** Same as single schedule object above.

---

### PATCH /containers/{id}/schedules/{schedule_id}

Update a schedule.

**Request Body (all fields optional):**
```json
{
  "name": "New Name",
  "cron": "0 0 * * *",
  "action": {"restart": {}},
  "enabled": false
}
```

**Response:** Updated schedule object.

---

### DELETE /containers/{id}/schedules/{schedule_id}

Delete a schedule.

**Response:**
```json
{
  "success": true,
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### POST /containers/{id}/schedules/{schedule_id}/run

Execute a schedule immediately (manual trigger).

**Response:**
```json
{
  "success": true,
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Schedule executed"
}
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `3001` | Bind port |
| `DOCKER_SOCKET` | Platform default | Docker socket path |
| `BACKUP_STORAGE` | `local` | Backup storage type (`local` or `s3`) |
| `BACKUP_LOCAL_PATH` | `/var/backups` | Local backup directory |
| `BACKUP_S3_BUCKET` | - | S3 bucket name |
| `BACKUP_S3_REGION` | - | S3 region |
| `BACKUP_S3_ACCESS_KEY` | - | S3 access key |
| `BACKUP_S3_SECRET_KEY` | - | S3 secret key |
| `SCHEDULES_PATH` | `/var/lib/stellar/schedules` | Schedule persistence directory |

---

## Error Responses

All errors follow this format:

```json
{
  "error": true,
  "message": "Container not found: abc123"
}
```

| Status Code | Description |
|-------------|-------------|
| 400 | Bad request / validation error |
| 404 | Container not found |
| 500 | Internal server error / Docker error |
