<script lang="ts">
  import Button from './Button.svelte'
</script>

<div class="card">
  <h1 class="title">Original</h1>
  <Button variant="ok" label="Go" count={3} rounded={true} />
  <p class="row">Label <Badge label="hi" /></p>
</div>
