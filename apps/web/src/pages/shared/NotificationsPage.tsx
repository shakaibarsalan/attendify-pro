import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { Bell, Check, CheckCheck, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  actionUrl: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = () => {
    api.get('/notifications')
      .then((res: any) => {
        setNotifications(res.data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadNotifications(); }, []);

  const markRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
    } catch {
      toast.error('Failed to mark notification');
    }
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast.success('All notifications marked as read');
    } catch {
      toast.error('Failed to mark all as read');
    }
  };

  const unread = notifications.filter((n) => !n.isRead).length;

  const typeColors: Record<string, string> = {
    fraud: 'bg-red-100 text-red-700',
    attendance: 'bg-green-100 text-green-700',
    session: 'bg-blue-100 text-blue-700',
    system: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-gray-500 mt-1">{unread} unread notification{unread !== 1 ? 's' : ''}</p>
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors"
          >
            <CheckCheck size={16} />
            Mark all as read
          </button>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-start gap-4 animate-pulse">
              <div className="w-16 h-6 rounded bg-gray-100 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-100 rounded w-1/3" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Bell size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No notifications yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`px-5 py-4 flex items-start gap-4 transition-colors ${!n.isRead ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}
            >
              <div className={`shrink-0 mt-0.5 px-2 py-1 rounded text-xs font-medium ${typeColors[n.type] || typeColors.system}`}>
                {n.type}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${!n.isRead ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                  {n.title}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">{n.message}</p>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-xs text-gray-400">{new Date(n.createdAt).toLocaleString()}</p>
                  {(n.actionUrl || (n as any).action_url) && (
                    <Link
                      to={(n.actionUrl || (n as any).action_url)!}
                      className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
                      onClick={() => !n.isRead && markRead(n.id)}
                    >
                      <ExternalLink size={11} />
                      View
                    </Link>
                  )}
                </div>
              </div>
              {!n.isRead && (
                <button
                  onClick={() => markRead(n.id)}
                  className="shrink-0 p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                  title="Mark as read"
                >
                  <Check size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
