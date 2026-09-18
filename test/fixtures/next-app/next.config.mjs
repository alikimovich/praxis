import { fileURLToPath } from 'node:url'
import createMDX from '@next/mdx'
import withPraxis from './.praxis/praxis-next.cjs'
export default withPraxis(createMDX({ options: { remarkPlugins: process.env.NODE_ENV === 'development' ? [fileURLToPath(new URL('./.praxis/praxis-mdx.mjs', import.meta.url))] : [] } })({ transpilePackages: ['praxis-fixture-ui'], pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'] }))
