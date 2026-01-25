{
  description = "Phoneme Party development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    flake-utils.url = "github:numtide/flake-utils";
    poetry2nix.url = "github:nix-community/poetry2nix";
  };

  outputs = { self, nixpkgs, flake-utils, poetry2nix }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        pythonEnv = pkgs.python3.withPackages (ps: [ ps.panphon ]);
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            shellcheck
            markdownlint-cli
            nodejs
            nodePackages.pnpm
            ripgrep
            pythonEnv
          ];
        };
      }
    );
}
