const std = @import("std");

pub fn build(b: *std.Build) void {
    // Always target wasm32-freestanding for WASM output
    const target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .freestanding,
    });

    const optimize = b.standardOptimizeOption(.{ .preferred_optimize_mode = .ReleaseFast });

    const exe = b.addExecutable(.{
        .name = "kaldi-fbank",
        .root_module = b.createModule(.{
            .root_source_file = b.path("fbank-standalone.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });

    // Disable the default entry point (_start) — we export C functions instead
    exe.entry = .disabled;
    // Keep all exported symbols (export fn) in the WASM export table
    exe.rdynamic = true;

    // Copy WASM into build/ in the source tree.
    // `install -D` creates the destination directory if it doesn't exist.
    // build/ is gitignored at the project root.
    const copy = b.addSystemCommand(&.{ "install", "-D" });
    copy.addFileArg(exe.getEmittedBin());
    copy.addArg("build/kaldi-fbank.wasm");
    b.getInstallStep().dependOn(&copy.step);
}
