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
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            shellcheck
            markdownlint-cli
            nodejs_22
            nodePackages.pnpm
            ripgrep
            python3  # interpreter for uv to use
            uv
            flite  # Speech synthesis system with lex_lookup for epitran
            stdenv.cc.cc.lib  # Provides libstdc++.so.6 for onnxruntime
            zlib  # Provides libz.so.1 for numpy
            zig  # Build kaldi-fbank WASM: cd wasm/kaldi-fbank && zig build
            go-task  # Task runner: run `task` to build everything
          ];

          shellHook = ''
            # Make native libs available to uv-installed packages (e.g., onnxruntime, numpy)
            export LD_LIBRARY_PATH="${pkgs.stdenv.cc.cc.lib}/lib:${pkgs.zlib}/lib:$LD_LIBRARY_PATH"
            export BAR=fuuz
            uv sync
            source .venv/bin/activate

            # To add a package: uv add <package>
            # To reinstall: uv sync
          '';
        };
      }
    );
}
