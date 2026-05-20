import {
  Html,
  Body,
  Container,
  Heading,
  Text,
  Button,
  Section,
  Hr,
} from "@react-email/components";

export function WorkoutPlanEmail(props: {
  memberName: string;
  fileName: string;
  appUrl: string;
}) {
  return (
    <Html>
      <Body
        style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#f6f6f6" }}
      >
        <Container
          style={{
            backgroundColor: "#ffffff",
            padding: "32px",
            maxWidth: "560px",
            margin: "0 auto",
          }}
        >
          <Heading style={{ fontSize: "20px", marginBottom: "16px" }}>
            Your new workout plan is ready
          </Heading>
          <Text>Hi {props.memberName},</Text>
          <Text>
            Your trainer has uploaded a fresh workout plan for you:{" "}
            <strong>{props.fileName}</strong>.
          </Text>
          <Text>
            Open your portal to view or download it. The plan is also saved
            there so you can re-download anytime.
          </Text>
          <Section style={{ marginTop: "24px" }}>
            <Button
              href={`${props.appUrl}/portal`}
              style={{
                backgroundColor: "#000",
                color: "#fff",
                padding: "12px 20px",
                textDecoration: "none",
                borderRadius: "6px",
              }}
            >
              Open my portal
            </Button>
          </Section>
          <Hr style={{ borderColor: "#eee", margin: "24px 0 16px" }} />
          <Text style={{ fontSize: "13px", color: "#666" }}>
            Train smart. See you at the gym!
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
