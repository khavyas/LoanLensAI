// Lets components outside the chat widget (e.g. the sidebar) open it without
// lifting the widget's state into App.js.
const listeners = new Set();

export const chatBus = {
  open: () => listeners.forEach((fn) => fn()),
  subscribe: (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
