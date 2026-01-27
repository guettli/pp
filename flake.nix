{
  description = "Phoneme Party development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        pythonEnv = pkgs.python3.withPackages (ps: with ps; [
          pip
          setuptools
        ]);
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

          shellHook = ''
            # Create and activate virtual environment if it doesn't exist
            if [ ! -d .venv ]; then
              echo "Creating virtual environment..."
              python -m venv .venv
              source .venv/bin/activate
              echo "Installing project dependencies with CPU-only PyTorch..."
              pip install -e . --extra-index-url https://download.pytorch.org/whl/cpu
            else
              source .venv/bin/activate
            fi

            # To manually reinstall dependencies, run: pip install -e . --extra-index-url https://download.pytorch.org/whl/cpu
          '';
        };
      }
    );
}
