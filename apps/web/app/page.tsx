import Link from "next/link";
import { WalletBar } from "@/components/WalletBar";
import { Card } from "@/components/ui/button";

const games = [
  { href: "/games/roulette", title: "Roulette", desc: "Red/Black 2x · Green 14x", color: "text-red-400" },
  { href: "/games/crash", title: "Crash", desc: "Cash out before crash", color: "text-accent" },
  { href: "/games/pvp", title: "PvP Rooms", desc: "Winner takes all", color: "text-primary" },
];

export default function HomePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Flipo</h1>
        <p className="text-sm text-zinc-400">TON Casino · Telegram Gifts</p>
      </header>

      <WalletBar />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-400">Games</h2>
        <div className="grid gap-3">
          {games.map((g) => (
            <Link key={g.href} href={g.href}>
              <Card className="transition hover:border-primary/50">
                <h3 className={`font-semibold ${g.color}`}>{g.title}</h3>
                <p className="text-sm text-zinc-400">{g.desc}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Link href="/inventory">
          <Card className="text-center hover:border-primary/50">
            <p className="font-medium">Inventory</p>
            <p className="text-xs text-zinc-400">NFT Gifts</p>
          </Card>
        </Link>
        <Link href="/staking">
          <Card className="text-center hover:border-primary/50">
            <p className="font-medium">Staking</p>
            <p className="text-xs text-zinc-400">3–5% / month</p>
          </Card>
        </Link>
      </section>
    </div>
  );
}
