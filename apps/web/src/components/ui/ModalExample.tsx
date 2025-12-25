// apps/web/src/components/ui/ModalExample.tsx
"use client";

import { useState } from "react";
import Surface from "./Surface";

export function ModalExample() {
  const [open, setOpen] = useState(false);

  return (
    <Surface className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="muted-text text-xs uppercase tracking-[0.14em]">Démo modale</p>
          <p className="title-text text-lg font-semibold">Halo clair + verre</p>
          <p className="paragraph-muted text-sm">
            Overlay clair, flou doux et focus ring cohérent. Aucun style global sur button/input.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-accent px-4 py-2 text-sm font-semibold focus-ring"
        >
          Ouvrir
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="veil" onClick={() => setOpen(false)} />

          <div className="modal-panel surface-elevated relative z-10 overflow-hidden">
            <header className="modal-header">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] muted-text">Modal</p>
                <p className="title-text text-lg font-semibold">Demande d’accès</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="link-chip text-xs font-semibold focus-ring"
              >
                ✕ Fermer
              </button>
            </header>

            <div className="space-y-4 p-5">
              <p className="paragraph-soft text-sm">
                Tout est aligné sur le thème « Infinity White + Halo ». Halo discret, surfaces blanches et
                hairlines cohérents.
              </p>

              <label className="input-shell">
                <span className="input-label">Email</span>
                <input className="input-field" placeholder="prenom@infinity.app" />
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-accent px-4 py-2 text-sm font-semibold focus-ring"
                  onClick={() => setOpen(false)}
                >
                  Envoyer
                </button>
                <button
                  type="button"
                  className="link-chip text-sm font-semibold focus-ring"
                  onClick={() => setOpen(false)}
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Surface>
  );
}
