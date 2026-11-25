import { WorkspaceModulePage } from "@/components/workspace-module-page";
import { CollaboratorsDirectory } from "@/components/collaborators-directory";

export default function ColleaguesPage() {
  return (
    <WorkspaceModulePage
      active="Colaboradores"
      eyebrow="DIRETÓRIO ORGANIZACIONAL"
      title="Colaboradores"
    >
      <CollaboratorsDirectory collaborators={[]} state="pending" />
    </WorkspaceModulePage>
  );
}
