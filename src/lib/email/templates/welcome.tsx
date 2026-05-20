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

export function WelcomeEmail(props: {
  memberName: string;
  gymId: number | null;
  planName: string;
  startDate: string;
  endDate: string;
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
          <Heading style={{ fontSize: "22px", marginBottom: "16px" }}>
            Welcome to Muscle Factory Gym, {props.memberName.split(" ")[0]}!
          </Heading>
          <Text>Hi {props.memberName},</Text>
          <Text>
            Your membership has been approved. We&apos;re glad to have you on
            board.
          </Text>

          {props.gymId !== null && (
            <Section
              style={{
                backgroundColor: "#fff7f5",
                border: "1px solid #fde4dc",
                borderRadius: "8px",
                padding: "16px",
                marginTop: "20px",
                marginBottom: "20px",
              }}
            >
              <Text
                style={{
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#666",
                  margin: "0 0 4px",
                }}
              >
                Your Gym ID
              </Text>
              <Text
                style={{
                  fontSize: "28px",
                  fontFamily: "monospace",
                  fontWeight: 600,
                  color: "#111",
                  margin: 0,
                }}
              >
                #{props.gymId}
              </Text>
              <Text
                style={{
                  fontSize: "12px",
                  color: "#666",
                  margin: "8px 0 0",
                }}
              >
                Type this ID at the gym&apos;s front-desk kiosk to check in.
              </Text>
            </Section>
          )}

          <Hr style={{ borderColor: "#eee", margin: "20px 0" }} />

          <Text style={{ fontWeight: 600, margin: "0 0 8px" }}>
            Your membership
          </Text>
          <Text style={{ margin: "0 0 4px" }}>
            <strong>Plan:</strong> {props.planName}
          </Text>
          <Text style={{ margin: "0 0 4px" }}>
            <strong>Valid:</strong> {props.startDate} — {props.endDate}
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

          <Text style={{ marginTop: "24px", fontSize: "13px", color: "#666" }}>
            Tip: you can also scan the QR at the gym kiosk with your phone
            camera to check in instantly.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
