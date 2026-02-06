# Development

## Nix

We suggest these settings in: `~/.config/nix/nix.conf`:

```nix
experimental-features = nix-command flakes

warn-dirty = false
```

## Direnv

We suggest you install `direnv` and `nix-direnv` via nix.

For example:

```console
nix profile add nixpkgs#direnv nixpkgs#nix-direnv
```

And add `/home/guettli/.nix-profile/bin` to your PATH.

This project has a `.envrc` which loads flake.nix and updates PATH.

## Secrets

Put your secrets into `.env` (not in git)
