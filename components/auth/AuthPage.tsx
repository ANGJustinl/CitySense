import type { Route } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Compass,
  KeyRound,
  MailCheck,
  MapPinned,
  ShieldCheck
} from "lucide-react";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { PasswordAuthForm } from "@/components/auth/PasswordAuthForm";
import { UpdatePasswordForm } from "@/components/auth/UpdatePasswordForm";
import { buildAuthPath } from "@/lib/auth/redirect";

type AuthPageMode = "login" | "register" | "forgot-password" | "update-password";

const errorMessages: Record<string, string> = {
  auth_callback_failed: "授权链接无效或已过期，请重新发送一封邮件。",
  invalid_callback: "授权链接不完整，请重新发送一封邮件。",
  invalid_recovery_session: "重置链接已失效，请重新发送密码重置邮件。"
};

export function AuthPage({
  intent,
  nextPath,
  errorCode
}: {
  intent: AuthPageMode;
  nextPath: string;
  errorCode?: string;
}) {
  const isRegister = intent === "register";
  const isLogin = intent === "login";
  const isForgot = intent === "forgot-password";
  const title = isRegister
    ? "创建你的城市账户"
    : isLogin
      ? "欢迎回到城市现场"
      : isForgot
        ? "找回你的账户"
        : "设置新密码";
  const description = isRegister
    ? "使用邮箱和密码创建 CitySense 账户，注册后请完成邮箱验证。"
    : isLogin
      ? "使用注册邮箱和密码登录，继续你的城市探索。"
      : isForgot
        ? "输入注册邮箱，我们会发送安全的密码重置邮件。"
        : "设置一个新的安全密码，完成后即可继续使用 CitySense。";
  const callbackError = errorCode ? errorMessages[errorCode] : undefined;
  const form = isLogin || isRegister ? (
    <PasswordAuthForm intent={isRegister ? "register" : "login"} nextPath={nextPath} />
  ) : isForgot ? (
    <ForgotPasswordForm nextPath={nextPath} />
  ) : (
    <UpdatePasswordForm nextPath={nextPath} />
  );

  return (
    <main className="auth-shell">
      <div className="auth-atmosphere" aria-hidden="true">
        <span className="auth-orbit auth-orbit-one" />
        <span className="auth-orbit auth-orbit-two" />
        <span className="auth-coordinate">31.2304° N · 121.4737° E</span>
      </div>
      <section className="auth-layout" aria-labelledby="auth-title">
        <div className="auth-story">
          <Link className="auth-back-link" href="/"><ArrowLeft size={16} /> 返回城市脉搏</Link>
          <div className="auth-brand-lockup">
            <span className="auth-brand-mark"><Activity size={22} /></span>
            <div><p className="eyebrow">Project CitySense</p><strong>每个人，都有自己的城市雷达。</strong></div>
          </div>
          <div className="auth-story-copy">
            <p className="auth-kicker">CITY FIELD NOTES · 08</p>
            <h2>把偶遇的地点，<br />留在你的城市档案里。</h2>
            <p>登录后分享小众地点、上传现场照片，并持续查看每一条投稿的审核状态。</p>
          </div>
          <div className="auth-benefits" aria-label="账户功能">
            <div><MapPinned size={18} /><span><strong>分享地点</strong>记录不在攻略里的城市切片</span></div>
            <div><Compass size={18} /><span><strong>追踪投稿</strong>随时查看提交与发布进度</span></div>
            <div><ShieldCheck size={18} /><span><strong>安全账户</strong>邮箱验证与密码找回都由 Supabase 保护</span></div>
          </div>
        </div>
        <div className="auth-card-wrap">
          <div className="auth-card">
            {isLogin || isRegister ? (
              <div className="auth-intent-nav" aria-label="账户入口">
                <Link aria-current={isLogin ? "page" : undefined} className={isLogin ? "active" : ""} href={buildAuthPath("login", nextPath) as Route}>登录</Link>
                <Link aria-current={isRegister ? "page" : undefined} className={isRegister ? "active" : ""} href={buildAuthPath("register", nextPath) as Route}>注册</Link>
              </div>
            ) : (
              <Link className="auth-back-link auth-card-back" href={buildAuthPath("login", nextPath) as Route}><ArrowLeft size={15} /> 返回登录</Link>
            )}
            <div className="auth-card-heading">
              <span className="auth-card-icon"><>{isForgot ? <KeyRound size={20} /> : <MailCheck size={20} />}</></span>
              <div><p className="eyebrow">CitySense Account</p><h1 id="auth-title">{title}</h1></div>
            </div>
            <p className="auth-description">{description}</p>
            {callbackError ? <p className="auth-alert" role="alert">{callbackError}</p> : null}
            {form}
            <p className="auth-fine-print">继续即表示你同意仅将该邮箱用于账户授权与必要的服务通知。</p>
          </div>
          <p className="auth-card-caption">EMAIL · PASSWORD · SECURE RECOVERY</p>
        </div>
      </section>
    </main>
  );
}
