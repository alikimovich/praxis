<script lang="ts">
  // SvelteKit route props are framework-injected, not editable component props.
  export let data: { title: string }
</script>

<div class="page">{data.title}</div>
