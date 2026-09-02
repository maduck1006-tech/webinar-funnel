import { Composition } from "remotion";
import { HelloComposition, helloSchema } from "./HelloComposition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Hello"
        component={HelloComposition}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1080}
        schema={helloSchema}
        defaultProps={{ title: "웨비나 퍼널" }}
      />
    </>
  );
};
