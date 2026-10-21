-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProjectVisibility" AS ENUM ('PRIVATE', 'WORKSPACE');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "personal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "organization_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("organization_id","profile_id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_memberships" (
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspace_memberships_pkey" PRIMARY KEY ("workspace_id","profile_id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "visibility" "ProjectVisibility" NOT NULL DEFAULT 'PRIVATE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_memberships" (
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'VIEWER',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_memberships_pkey" PRIMARY KEY ("project_id","profile_id")
);

-- CreateIndex
CREATE INDEX "organization_memberships_profile_id_organization_id_idx" ON "organization_memberships"("profile_id", "organization_id");

-- CreateIndex
CREATE INDEX "workspaces_organization_id_deleted_at_idx" ON "workspaces"("organization_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_organization_id_id_key" ON "workspaces"("organization_id", "id");

-- CreateIndex
CREATE INDEX "workspace_memberships_profile_id_organization_id_idx" ON "workspace_memberships"("profile_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_memberships_organization_id_workspace_id_profile__key" ON "workspace_memberships"("organization_id", "workspace_id", "profile_id");

-- CreateIndex
CREATE INDEX "projects_workspace_id_deleted_at_created_at_id_idx" ON "projects"("workspace_id", "deleted_at", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organization_id_workspace_id_id_key" ON "projects"("organization_id", "workspace_id", "id");

-- CreateIndex
CREATE INDEX "project_memberships_workspace_id_profile_id_idx" ON "project_memberships"("workspace_id", "profile_id");

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_organization_id_workspace_id_fkey" FOREIGN KEY ("organization_id", "workspace_id") REFERENCES "workspaces"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_organization_id_profile_id_fkey" FOREIGN KEY ("organization_id", "profile_id") REFERENCES "organization_memberships"("organization_id", "profile_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_workspace_id_fkey" FOREIGN KEY ("organization_id", "workspace_id") REFERENCES "workspaces"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_organization_id_workspace_id_project_i_fkey" FOREIGN KEY ("organization_id", "workspace_id", "project_id") REFERENCES "projects"("organization_id", "workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_organization_id_workspace_id_profile_i_fkey" FOREIGN KEY ("organization_id", "workspace_id", "profile_id") REFERENCES "workspace_memberships"("organization_id", "workspace_id", "profile_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Fail closed for non-owner connections until Phase 01 policies are reviewed.
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_memberships" ENABLE ROW LEVEL SECURITY;
