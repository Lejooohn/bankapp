// DOM event helpers that replace the Svelte 4 modifiers (`on:click|self`, `on:click|stopPropagation`)
// that were carried over by the migration. They keep the same behaviour:
// - self: runs the handler only when the event was fired on the element itself (backdrops)
// - stopPropagation: stops the event from reaching outer elements, then runs the optional handler

type Handler = (event: Event) => unknown;

export function self(handler: Handler): Handler {
  return (event) => {
    if (event.target === event.currentTarget) handler(event);
  };
}

export function stopPropagation(handler?: Handler): Handler {
  return (event) => {
    event.stopPropagation();
    handler?.(event);
  };
}
