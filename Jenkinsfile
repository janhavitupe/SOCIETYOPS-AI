// Jenkins pipeline for SocietyOps AI. It runs the same checks as
// .github/workflows/ci.yml: typecheck, lint, formatting, migrations, the test
// suite against a real PostgreSQL, the production build and, where Docker is
// available, a smoke test of the Docker image.
//
// Two ways it runs:
//  - A Windows (or any) agent without Docker uses the agent's own Node and a
//    PostgreSQL given in the Jenkins credential "societyops-database-url". The
//    build works in its own schemas (jenkins_ci, jenkins_test), so it never
//    touches the data in that database's other schemas.
//  - A Linux agent with Docker runs PostgreSQL and Node in throwaway
//    containers, then builds and boots the Docker image.
//
// Plugins: Pipeline, Git, Credentials Binding and JUnit (all in the suggested
// set); Docker Pipeline only for the Docker route.

def useDocker = false

/** One shell step on either kind of agent. */
def run(String command) {
  if (isUnix()) {
    sh command
  } else {
    bat command
  }
}

pipeline {
  agent any

  options {
    timeout(time: 40, unit: 'MINUTES')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    // Used only by this pipeline's test runs; never in production.
    BETTER_AUTH_SECRET = 'ci-only-secret-never-used-outside-this-runner-at-least-32-chars'
    NODE_OPTIONS = '--max-old-space-size=2048'
    // Seeding the build's own schema wipes it first.
    SEED_RESET = 'true'
  }

  stages {
    stage('Prepare') {
      steps {
        script {
          useDocker = isUnix() && sh(script: 'docker version >/dev/null 2>&1', returnStatus: true) == 0
          echo(useDocker ? 'Docker found: PostgreSQL and Node run in containers.' : 'No Docker: using this agent\'s Node and the configured PostgreSQL.')
          run('node --version')
          run('npm --version')
        }
      }
    }

    stage('Checks and tests') {
      steps {
        script {
          def checks = {
            run('npm ci')
            run('npx prisma generate')
            run('npm run typecheck')
            run('npm run lint')
            run('npm run format:check')
            run('npx prisma migrate deploy')
            run('npx prisma db seed')
            // The suite migrates and seeds TEST_DATABASE_URL itself (tests/globalSetup.ts).
            run('npx vitest run --reporter=default --reporter=junit --outputFile.junit=reports/junit.xml')
            run('npm run build')
          }

          if (useDocker) {
            docker.image('postgres:16-alpine').withRun(
              '-e POSTGRES_USER=societyops -e POSTGRES_PASSWORD=ci -e POSTGRES_DB=societyops'
            ) { db ->
              docker.image('postgres:16-alpine').inside("--link ${db.id}:db") {
                sh 'until pg_isready -h db -U societyops -d societyops; do sleep 1; done'
              }
              // npm and Prisma write caches under HOME; the container runs as Jenkins's user.
              docker.image('node:22').inside("--link ${db.id}:db") {
                withEnv([
                  'DATABASE_URL=postgresql://societyops:ci@db:5432/societyops?schema=public',
                  'TEST_DATABASE_URL=postgresql://societyops:ci@db:5432/societyops?schema=societyops_test',
                  "HOME=${env.WORKSPACE}",
                  "npm_config_cache=${env.WORKSPACE}/.npm",
                ]) { checks() }
              }
            }
          } else {
            withCredentials([string(credentialsId: 'societyops-database-url', variable: 'BASE_DATABASE_URL')]) {
              // The build's own schemas in that database; whatever schema the URL named is ignored.
              def base = env.BASE_DATABASE_URL.split('\\?')[0]
              withEnv([
                "DATABASE_URL=${base}?schema=jenkins_ci",
                "TEST_DATABASE_URL=${base}?schema=jenkins_test",
              ]) { checks() }
            }
          }
        }
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'reports/junit.xml'
        }
      }
    }

    // Builds the image and boots it against an empty database: proves the
    // Dockerfile, the production-only install and migrate-on-start all work.
    stage('Docker image') {
      when { expression { useDocker } }
      environment { IMAGE = "societyops-ai:${env.BUILD_NUMBER}" }
      steps {
        sh 'docker build -t "$IMAGE" .'
        sh '''
          set -e
          NET="societyops-ci-$BUILD_NUMBER"
          docker network create "$NET"
          docker run -d --name "db-$BUILD_NUMBER" --network "$NET" \
            -e POSTGRES_USER=societyops -e POSTGRES_PASSWORD=ci -e POSTGRES_DB=societyops \
            postgres:16-alpine
          until docker exec "db-$BUILD_NUMBER" pg_isready -U societyops -d societyops; do sleep 1; done
          docker run -d --name "app-$BUILD_NUMBER" --network "$NET" \
            -e DATABASE_URL="postgresql://societyops:ci@db-$BUILD_NUMBER:5432/societyops?schema=public" \
            -e BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET" \
            "$IMAGE"

          for i in $(seq 1 60); do
            if docker run --rm --network "$NET" curlimages/curl:8.10.1 -fsS "http://app-$BUILD_NUMBER:3000/api/health"; then
              docker run --rm --network "$NET" curlimages/curl:8.10.1 -fsS "http://app-$BUILD_NUMBER:3000/login" | grep -q '<div id="root">'
              exit 0
            fi
            sleep 2
          done
          docker logs "app-$BUILD_NUMBER"
          exit 1
        '''
      }
      post {
        always {
          sh '''
            docker rm -f "app-$BUILD_NUMBER" "db-$BUILD_NUMBER" >/dev/null 2>&1 || true
            docker network rm "societyops-ci-$BUILD_NUMBER" >/dev/null 2>&1 || true
            docker image rm "$IMAGE" >/dev/null 2>&1 || true
          '''
        }
      }
    }
  }
}
