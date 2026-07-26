"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Estado = "idle" | "enviando" | "enviado" | "error";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<Estado>("idle");
  const [mensajeError, setMensajeError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEstado("enviando");
    setMensajeError("");

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectTo,
        // Poner en false si querés que solo entren usuarios ya existentes.
        shouldCreateUser: true,
      },
    });

    if (error) {
      setEstado("error");
      setMensajeError(error.message);
      return;
    }

    setEstado("enviado");
  }

  if (estado === "enviado") {
    return (
      <div className="rounded-lg border border-black/10 p-6 text-center dark:border-white/15">
        <p className="text-sm">
          Te mandamos un link a <strong className="break-all">{email}</strong>.
        </p>
        <p className="mt-2 text-sm opacity-70">
          Abrilo en este mismo navegador para entrar. Si no lo ves, revisá spam.
        </p>
        <button
          type="button"
          onClick={() => setEstado("idle")}
          className="mt-4 text-sm underline underline-offset-4 opacity-70 hover:opacity-100"
        >
          Usar otro email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="vos@ejemplo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-lg border border-black/15 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
      />

      <button
        type="submit"
        disabled={estado === "enviando"}
        className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90 active:scale-[.99] disabled:opacity-50 disabled:active:scale-100"
      >
        {estado === "enviando" ? "Enviando…" : "Enviarme el link"}
      </button>

      {estado === "error" && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {mensajeError}
        </p>
      )}
    </form>
  );
}
