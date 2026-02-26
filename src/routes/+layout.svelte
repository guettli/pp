<script lang="ts">
  import { onMount } from "svelte";
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();

  let buildDateLocal = $state("");

  onMount(() => {
    buildDateLocal = new Date(__BUILD_DATE__).toLocaleString();
  });
</script>

{@render children()}

<footer class="text-center text-muted py-3" style="font-size: 0.75rem">
  Build: <time datetime={__BUILD_DATE__} title={__BUILD_DATE__}
    >{buildDateLocal || __BUILD_DATE__}</time
  >
</footer>
