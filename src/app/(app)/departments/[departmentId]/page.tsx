import DepartmentDetailsClientPage from './client-page';

export default function DepartmentDetailsPage({ params }: { params: { departmentId: string } }) {
  return <DepartmentDetailsClientPage departmentId={params.departmentId} />;
}
