<script lang="ts">
  interface Props {
    variant?: 'ok' | 'warn' | 'error'
    label?: string
    count?: number
    rounded?: boolean
  }
  let { variant = 'ok', label = 'Badge', count = 0, rounded = false }: Props = $props()
</script>

<button class="btn" class:rounded>{label} {count} {variant}</button>
