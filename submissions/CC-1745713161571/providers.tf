terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    # TODO: Add random provider if needed for unique names
    # random = {
    #   source = "hashicorp/random"
    #   version = "~> 3.0"
    # }
  }
  required_version = ">= 1.0"
}

provider "aws" {
  region = var.aws_region
  # Configuration options
  # Assume Role, Credentials file, etc.
}

# TODO: Configure Kubernetes provider once EKS cluster is created
# provider "kubernetes" {
#   host                   = data.aws_eks_cluster.cluster.endpoint
#   cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority.0.data)
#   token                  = data.aws_eks_cluster_auth.cluster.token
# } 