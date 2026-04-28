import { ArrowRight, Server } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../components/Button';
import styles from '../styles/Guest.module.css';

const LOGIN_URL = 'https://login.smaiclub.top/login?redirect=https%3A%2F%2Fsub.smaiclub.top%2Fdashboard';

export default function Guest() {
  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <div className={styles.brand}>
          <Server size={28} />
          <span>SmaiClub Sub</span>
        </div>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>SmaiClub</p>
          <h1>订阅入口</h1>
          <p>登录后查看你的订阅信息，并复制客户端订阅链接。</p>
        </div>
        <div className={styles.actions}>
          <a href={LOGIN_URL}>
            <Button type="button" icon={<ArrowRight size={18} />}>登录 SmaiClub</Button>
          </a>
          <Link to="/dashboard">
            <Button type="button" tone="ghost">进入控制台</Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
