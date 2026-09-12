export async function composerOptions(win, label) {
  await win.getByRole('button', { name: label, exact: true }).click()
  await win.getByRole('menu').waitFor()
  const options = await win.getByRole('menuitemradio').evaluateAll(items =>
    items.map(item => ({ value: item.dataset.value, label: item.textContent.trim() })))
  if (await win.getByRole('menuitem', { name: 'Add new…', exact: true }).count()) {
    options.push({ value: '__manage-providers__', label: 'Add new…' })
  }
  await win.keyboard.press('Escape')
  await win.getByRole('menu').waitFor({ state: 'hidden' })
  return options
}

export async function chooseComposerOption(win, label, value) {
  await win.getByRole('button', { name: label, exact: true }).click()
  await win.getByRole('menu').waitFor()
  if (value === '__manage-providers__') {
    await win.getByRole('menuitem', { name: 'Add new…', exact: true }).click()
  } else {
    const option = win.locator('[role="menuitemradio"]').filter({ visible: true })
    const values = await option.evaluateAll(items => items.map(item => item.dataset.value))
    const index = values.indexOf(value)
    if (index < 0) throw new Error(`Missing ${label} option: ${value}`)
    await option.nth(index).click()
  }
}
