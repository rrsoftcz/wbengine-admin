/** Svelte action: moves focus to the element when it appears, so screen readers and keyboard users land on a result. */
export function focusOnMount(node: HTMLElement) {
    node.focus({ preventScroll: false });
}
