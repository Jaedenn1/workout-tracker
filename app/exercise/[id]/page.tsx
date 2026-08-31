"use client";

import { useParams } from "next/navigation";
import ExerciseDetail from "../../../src/components/ExerciseDetail";

export default function ExercisePage() {
  const params = useParams<{ id: string }>();
  return <ExerciseDetail exerciseId={decodeURIComponent(params.id)} />;
}
