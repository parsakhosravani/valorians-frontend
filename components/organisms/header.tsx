import { Coin, User } from "../molecules";
import { TResource } from "../templates";
import { Resource } from "./resource";

interface HeaderProps {
  resources: TResource[];
  activeResourceId: number;
  onChangeResource: (resource: TResource) => void;
}

export const Header: React.FC<HeaderProps> = ({
  resources,
  onChangeResource,
  activeResourceId,
}) => {
  return (
    <header className="flex flex-col p-2 gap-2 border-b-2 rounded-b-3xl border-[#019AF0] bg-[#191F27]">
      <div className="flex items-center justify-between">
        <User />
        <Coin />
      </div>
      <div className="items-center gap-1 w-full flex">
        {resources.map((item) => (
          <Resource
            key={item.id}
            resourceData={item}
            isActive={activeResourceId === item.id}
            onChangeResource={onChangeResource}
          />
        ))}
      </div>
    </header>
  );
};
