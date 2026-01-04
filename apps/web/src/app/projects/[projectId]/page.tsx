import ProjectEditor from "@/components/project/ProjectEditor";

type Params = {
  projectId: string;
};

export default async function ProjectPage({
  params,
}: {
  params: Params | Promise<Params>;
}) {
  const resolved = await params;
  return <ProjectEditor projectId={resolved.projectId} />;
}
