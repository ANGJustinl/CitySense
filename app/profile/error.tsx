"use client";

export default function ProfileError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="app-shell">
      <div className="profile-page">
        <section className="profile-section">
          <div className="section-heading"><span>画像暂时不可用</span></div>
          <p className="profile-error">读取或重算画像失败，请稍后重试。</p>
          <button className="primary-button" onClick={reset} type="button">重新加载</button>
        </section>
      </div>
    </main>
  );
}
