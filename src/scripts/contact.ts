// Progressive enhancement for the contact form: JSON POST + inline status.
// Without JS the form still posts to /api/contact and gets a plain response.
type Msgs = { ok: string; err: string; ratelimited: string; turnstile: string; sending: string; submit: string };

const form = document.querySelector<HTMLFormElement>('[data-contact-form]');
if (form) {
  const msgs = JSON.parse(form.dataset.messages ?? '{}') as Msgs;
  const status = form.querySelector<HTMLElement>('[data-status]')!;
  const submit = form.querySelector<HTMLButtonElement>('[data-submit]')!;
  // getElementById: the Workers runtime types declare their own global `Element` (HTMLRewriter), which clashes with the DOM generic.
const topic = document.getElementById('cf-topic') as HTMLSelectElement | null;

  // Preselect topic from ?topic=… (service CTAs link here).
  const wanted = new URLSearchParams(location.search).get('topic');
  if (wanted && topic && Array.from(topic.options).some((o) => o.value === wanted)) topic.value = wanted;

  const show = (kind: 'ok' | 'err', text: string) => {
    status.dataset.kind = kind;
    status.textContent = text;
    status.hidden = false;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    status.hidden = true;
    submit.disabled = true;
    submit.textContent = msgs.sending;
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form),
      });
      if (res.ok) {
        show('ok', msgs.ok);
        form.reset();
        (window as any).turnstile?.reset?.();
      } else if (res.status === 429) {
        show('err', msgs.ratelimited);
      } else if (res.status === 403) {
        show('err', msgs.turnstile);
        (window as any).turnstile?.reset?.();
      } else {
        show('err', msgs.err);
      }
    } catch {
      show('err', msgs.err);
    } finally {
      submit.disabled = false;
      submit.textContent = msgs.submit;
    }
  });
}
