import { Tribe } from "@/components";
import { promises as fs } from "fs";
import path from "path";

export default async function Page() {
  const buildingsDirectory = path.join(
    process.cwd(),
    "public/images/buildings"
  );
  const buildingFiles = await fs.readdir(buildingsDirectory);

  const buildings = buildingFiles.map((file) => ({
    name: path.parse(file).name,
    src: require(`/public/images/buildings/${file}`),
  }));

  return <Tribe buildings={buildings} />;
}
