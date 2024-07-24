import { Coin, User } from "../molecules";
import { TResource } from "../templates";
import { Resource } from "./Resource";

interface HeaderProps {
  resources: TResource[];
  activeResourceId: number;
  coin: number;
  resourceCapacity: number;
  onChangeResource: (resource: TResource) => void;
}

export const Header: React.FC<HeaderProps> = ({
  resources,
  onChangeResource,
  activeResourceId,
  resourceCapacity,
  coin,
}) => {
  return (
    <header className="flex flex-col p-2 border-b-2 rounded-b-3xl border-[#019AF0] bg-[#191F27]">
      <div className="flex items-center justify-between">
        <User />
        <Coin coin={coin} />
      </div>
      <div className="items-center w-full flex pb-1">
        {resources.map((item) => (
          <Resource
            key={item.id}
            resourceData={item}
            resourceCapacity={resourceCapacity}
            isActive={activeResourceId === item.id}
            onChangeResource={onChangeResource}
          />
        ))}
      </div>
    </header>
  );
};
