// Matches every URL that isn't an intercepted modal route, so the modal slot
// renders nothing — this is what closes the modal when you navigate away
// (e.g. the post-create redirect to the new node, or Home). Without it, Next's
// parallel-route soft navigation would keep the previous modal on screen.
export default function ModalCatchAll() {
  return null;
}
