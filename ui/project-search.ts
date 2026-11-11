export function filterProjects<T extends { title: string }>(projects: T[], query: string): T[] {
  const value = query.trim().toLocaleLowerCase();
  return value ? projects.filter(project => project.title.toLocaleLowerCase().includes(value)) : projects;
}
