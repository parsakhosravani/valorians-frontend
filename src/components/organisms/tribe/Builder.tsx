import { InfoDrawer } from "@/components/organisms/InfoDrawer";
import { GameIcon } from "@/art";
import { useGame } from "@/context";

export const Builder: React.FC = () => {
  const { state, rates } = useGame();
  const free = rates.builders - state.queue.length;

  return (
    <div className="flex items-center gap-2.5 px-3 h-12 rounded-2xl bg-ink-800 border border-ink-500/70 shadow-card">
      <GameIcon id="builder" size={24} />
      <div className="flex-1 flex items-center gap-1.5">
        {Array.from({ length: rates.builders }, (_, i) => (
          <span key={i} className={i < free ? "w-2.5 h-2.5 rounded-full bg-moss-400" : "w-2.5 h-2.5 rounded-full bg-ink-500"} />
        ))}
        <span className="ml-1 text-small font-bold">
          {free} of {rates.builders} builder{rates.builders === 1 ? "" : "s"} free
        </span>
      </div>
      <InfoDrawer
        content="Each builder works on one building at a time. Upgrade your Town Hall to hire more builders at levels 5, 10 and 15, and to build faster."
        title="Builders"
      />
    </div>
  );
};
