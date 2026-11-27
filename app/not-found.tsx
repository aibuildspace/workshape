import Link from "next/link";
import { Brand } from "@/components/brand";

export default function NotFound() {
  return <main className="login-screen"><div className="login-panel"><Brand /><h1>Page unavailable</h1>
    <p className="muted">The page may have moved or you may need permission to see it.</p>
    <Link className="button button-primary" href="/">Back to Workshape</Link>
  </div></main>;
}
