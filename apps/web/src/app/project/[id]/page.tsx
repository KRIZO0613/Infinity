import { redirect } from "next/navigation";

type Params = { id: string };

export default async function ProjectRedirect({
  params,
}: {
  params: Params | Promise<Params>;
}) {
  const resolved = await params;
  redirect(`/projects/${encodeURIComponent(resolved.id)}`);
}
