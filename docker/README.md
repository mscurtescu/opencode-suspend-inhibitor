# Dev containers

One Dockerfile per profile. The filename is the profile id.

| Profile | Dockerfile | Base | Session inhibit |
|---------|------------|------|-----------------|
| `ubuntu2404` | `Dockerfile.ubuntu2404` | `ubuntu:24.04` | `gnome-session-bin` |

```bash
task container:build
task container:run
task container:test
PROFILE=ubuntu2404 task container:build
```

## Add a profile

Copy `Dockerfile.ubuntu2404` to e.g. `Dockerfile.debian12`, adjust `FROM` and packages, then `PROFILE=debian12 task container:build`.