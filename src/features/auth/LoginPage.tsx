import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "./AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err: any) {
      const message = err?.response?.data?.error ?? err?.message ?? "Login failed";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left Pane - Branding/Visuals */}
      <div className="relative hidden lg:flex flex-col items-center justify-center overflow-hidden bg-zinc-950 p-10 text-white">
        {/* Abstract glowing background effect */}
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-blue-600/20 blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-indigo-600/20 blur-[100px]" />
        
        <div className="relative z-10 flex flex-col items-center space-y-6">
          <div className="h-40 w-40 rounded-[2rem] bg-white/5 p-6 shadow-2xl backdrop-blur-sm border border-white/10 flex items-center justify-center transition-transform hover:scale-105 duration-500">
            <img src="/logo.png" alt="NaviMind Logo" className="h-full w-full object-contain drop-shadow-xl" />
          </div>
          <div className="text-center space-y-3">
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent">NaviMind</h1>
            <p className="text-lg text-zinc-400 font-medium">Indoor Navigation & AI Assistant</p>
          </div>
        </div>
      </div>

      {/* Right Pane - Login Form */}
      <div className="flex flex-col items-center justify-center p-8 sm:p-12 lg:p-24 relative overflow-hidden bg-background">
        {/* Subtle mobile background glow */}
        <div className="absolute inset-0 lg:hidden pointer-events-none">
          <div className="absolute top-0 right-0 h-64 w-64 rounded-full bg-blue-500/5 blur-[80px]" />
        </div>

        <div className="w-full max-w-[400px] space-y-8 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex flex-col space-y-2 text-center lg:text-left">
            <div className="lg:hidden flex justify-center mb-6">
              <div className="h-24 w-24 rounded-2xl bg-zinc-950/5 dark:bg-white/5 p-4 shadow-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
                <img src="/logo.png" alt="NaviMind Logo" className="h-full w-full object-contain" />
              </div>
            </div>
            <h2 className="text-3xl font-bold tracking-tight">Welcome back</h2>
            <p className="text-sm text-muted-foreground">
              Sign in to your staff account to continue
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="font-medium">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@navimind.local"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 bg-background/50 backdrop-blur-sm transition-all focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="font-medium">Password</Label>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 bg-background/50 backdrop-blur-sm transition-all focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>
            </div>

            <Button 
              type="submit" 
              disabled={isSubmitting} 
              className="w-full h-12 text-base font-medium transition-all active:scale-[0.98] bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25"
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          
          <div className="text-center text-sm text-muted-foreground/60 font-medium">
            Protected area for authorized NaviMind personnel only.
          </div>
        </div>
      </div>
    </div>
  );
}
