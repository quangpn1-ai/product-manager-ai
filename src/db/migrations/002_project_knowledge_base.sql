-- ============================================
-- Project Knowledge Base Migration
-- Version: 002
-- ============================================

-- ============================================
-- Projects
-- ============================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  description TEXT NULL,
  domain VARCHAR(100) NULL, -- FinTech, HealthTech, E-commerce, SaaS, Other
  status TEXT NOT NULL DEFAULT 'active', -- active, archived
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_org ON projects(org_id);
CREATE INDEX idx_projects_status ON projects(org_id, status);
CREATE UNIQUE INDEX idx_projects_slug ON projects(org_id, slug);

-- Updated_at trigger
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Project Documents
-- ============================================
CREATE TABLE project_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  type TEXT NOT NULL, -- functional_spec, technical_spec, api_doc, business_rules, glossary, other
  file_path VARCHAR(500) NOT NULL,
  file_type VARCHAR(10) NOT NULL, -- md, pdf, txt, docx
  file_size INTEGER NOT NULL,
  content_text TEXT NULL, -- Parsed text content for AI context
  version VARCHAR(50) NOT NULL DEFAULT '1.0',
  priority TEXT NOT NULL DEFAULT 'medium', -- high, medium, low
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  tags JSONB NULL, -- Array of tags
  metadata JSONB NULL, -- Additional info
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_docs_project ON project_documents(project_id);
CREATE INDEX idx_docs_active ON project_documents(project_id, is_active);
CREATE INDEX idx_docs_type ON project_documents(type);
CREATE INDEX idx_docs_priority ON project_documents(priority);
CREATE INDEX idx_docs_tags ON project_documents USING GIN(tags);

-- Updated_at trigger
CREATE TRIGGER update_project_documents_updated_at BEFORE UPDATE ON project_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Project Context Rules
-- ============================================
CREATE TABLE project_context_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- constraint, standard, tone, do_not
  rule_text TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0, -- Lower = higher priority
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rules_project ON project_context_rules(project_id);
CREATE INDEX idx_rules_active ON project_context_rules(project_id, is_active);
CREATE INDEX idx_rules_category ON project_context_rules(category);
CREATE INDEX idx_rules_priority ON project_context_rules(project_id, priority);

-- Updated_at trigger
CREATE TRIGGER update_project_context_rules_updated_at BEFORE UPDATE ON project_context_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Run Context Usage (Traceability)
-- ============================================
CREATE TABLE run_context_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
  tokens_from_doc INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_run ON run_context_usage(run_id);
CREATE INDEX idx_usage_doc ON run_context_usage(document_id);

-- ============================================
-- Modify Tasks table - Add project_id
-- ============================================
ALTER TABLE tasks ADD COLUMN project_id UUID NULL REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX idx_tasks_project ON tasks(project_id);

-- ============================================
-- Add org_id to project_documents for easier querying
-- ============================================
ALTER TABLE project_documents ADD COLUMN org_id UUID NULL;

-- Update org_id from projects
UPDATE project_documents pd
SET org_id = p.org_id
FROM projects p
WHERE pd.project_id = p.id;

-- Make it NOT NULL and add FK
ALTER TABLE project_documents ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE project_documents ADD CONSTRAINT fk_project_documents_org
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX idx_docs_org ON project_documents(org_id);

-- ============================================
-- Add org_id to project_context_rules for easier querying
-- ============================================
ALTER TABLE project_context_rules ADD COLUMN org_id UUID NULL;

-- Update org_id from projects
UPDATE project_context_rules pcr
SET org_id = p.org_id
FROM projects p
WHERE pcr.project_id = p.id;

-- Make it NOT NULL and add FK
ALTER TABLE project_context_rules ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE project_context_rules ADD CONSTRAINT fk_project_context_rules_org
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX idx_rules_org ON project_context_rules(org_id);
