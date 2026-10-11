CREATE TABLE IF NOT EXISTS subscription_plans (
  id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  max_students INTEGER NOT NULL,
  max_teachers INTEGER NOT NULL,
  max_departments INTEGER NOT NULL,
  price_monthly DECIMAL(10,2) NOT NULL,
  price_yearly DECIMAL(10,2),
  features JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO subscription_plans (id, name, description, max_students, max_teachers, max_departments, price_monthly, price_yearly, features, sort_order) VALUES
('starter', 'Starter', 'For small institutes and individual departments', 500, 20, 5, 29, 290, '["Face recognition attendance", "QR code attendance", "Basic analytics dashboard", "Up to 500 students", "Email support"]', 1),
('professional', 'Professional', 'For growing universities and colleges', 2000, 100, 20, 79, 790, '["Everything in Starter", "Anti-spoof liveness detection", "Advanced fraud analytics", "Real-time notifications", "Up to 2,000 students", "Priority email support"]', 2),
('enterprise', 'Enterprise', 'For large universities with multiple campuses', 10000, 500, 100, 199, 1990, '["Everything in Professional", "Multi-campus support", "Custom integrations & API", "Dedicated account manager", "Up to 10,000 students", "24/7 priority support"]', 3),
('unlimited', 'Unlimited', 'For university networks and consortia', 999999, 999999, 999999, 499, 4990, '["Everything in Enterprise", "Unlimited students & teachers", "White-label branding", "On-premise deployment option", "SLA guarantee", "Custom AI model training"]', 4)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE institutions ADD COLUMN IF NOT EXISTS plan_id VARCHAR(20) REFERENCES subscription_plans(id);
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS plan_status VARCHAR(20) DEFAULT 'trial';
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS plan_selected_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '14 days');
