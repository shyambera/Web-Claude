import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";

export function Settings() {
  const [phone, setPhone] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    api
      .getAccount()
      .then((account) => setPhone(account.alertPhoneNumber ?? ""))
      .finally(() => setLoaded(true));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedMessage(null);
    setSaving(true);
    try {
      await api.updateAccount({ alertPhoneNumber: phone.trim() === "" ? null : phone.trim() });
      setSavedMessage("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <div className="page loading">Loading…</div>;

  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <h2 style={{ marginTop: 0 }}>Alert channels</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: -6 }}>
          Email alerts always go to your account owner's address. Add a phone number to also receive alerts by
          WhatsApp and SMS.
        </p>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="phone">Alert phone number</label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+14155552671"
            />
            <div className="hint">E.164 format, e.g. +14155552671 or +919812345678. Leave blank to disable.</div>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            {savedMessage && <span style={{ alignSelf: "center", color: "var(--up)", fontSize: 13 }}>{savedMessage}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
